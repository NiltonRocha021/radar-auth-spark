// Server-only. Consome alert_dispatch_queue e envia via Telegram / Discord / Email.
// Nunca importe deste arquivo em código do cliente ou no top-level de .functions.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Channel = "telegram" | "email" | "discord";

type EventRow = {
  id: string;
  user_id: string;
  source: string;
  severity: string;
  kind: string;
  symbol: string | null;
  title: string;
  message: string;
  payload: unknown;
};

type PrefsRow = {
  channels: {
    telegram?: { enabled: boolean; chat_id: string | null };
    email?: { enabled: boolean; address: string | null };
    discord?: { enabled: boolean; webhook_url: string | null };
  };
  quiet_hours: { enabled: boolean; start: string; end: string; timezone: string };
};

function isQuietNow(prefs: PrefsRow, severity: string): boolean {
  const q = prefs.quiet_hours;
  if (!q?.enabled) return false;
  if (severity === "critical") return false; // criticals sempre passam
  const now = new Date();
  const hhmm = now.toISOString().slice(11, 16); // UTC, simplificação
  const { start, end } = q;
  // janela pode cruzar meia-noite
  if (start <= end) return hhmm >= start && hhmm < end;
  return hhmm >= start || hhmm < end;
}

function formatMessage(ev: EventRow) {
  const emoji = ev.severity === "critical" ? "🔴" : ev.severity === "warning" ? "🟡" : "🔵";
  const symbol = ev.symbol ? ` · ${ev.symbol}` : "";
  return `${emoji} *${ev.title}*${symbol}\n${ev.message}`;
}

async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}

async function sendDiscord(webhookUrl: string, ev: EventRow) {
  const color = ev.severity === "critical" ? 0xe24b4a : ev.severity === "warning" ? 0xf59e0b : 0x3b82f6;
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: ev.title,
        description: ev.message,
        color,
        fields: ev.symbol ? [{ name: "Symbol", value: ev.symbol, inline: true }] : undefined,
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
}

async function sendEmail(_address: string, _ev: EventRow) {
  // Placeholder: SMTP / Resend será plugado na onda de emails transacionais.
  // Por ora, marca como "skipped" para não travar a fila.
  throw new Error("EMAIL_NOT_CONFIGURED");
}

async function deliver(channel: Channel, prefs: PrefsRow, ev: EventRow): Promise<void> {
  const text = formatMessage(ev);
  if (channel === "telegram") {
    const chatId = prefs.channels.telegram?.chat_id;
    if (!chatId) throw new Error("Telegram chat_id not set");
    await sendTelegram(chatId, text);
  } else if (channel === "discord") {
    const url = prefs.channels.discord?.webhook_url;
    if (!url) throw new Error("Discord webhook_url not set");
    await sendDiscord(url, ev);
  } else if (channel === "email") {
    const addr = prefs.channels.email?.address;
    if (!addr) throw new Error("Email address not set");
    await sendEmail(addr, ev);
  }
}

const MAX_ATTEMPTS = 3;

export async function drainDispatchQueue(opts: { userId?: string; limit?: number }): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as SupabaseClient<Database>;
  const limit = Math.min(opts.limit ?? 50, 200);

  let q = admin
    .from("alert_dispatch_queue")
    .select("id, event_id, user_id, channel, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  if (opts.userId) q = q.eq("user_id", opts.userId);

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return { processed: 0, sent: 0, failed: 0, skipped: 0 };

  // agrupa prefs/events por user_id/event_id
  const userIds = [...new Set(rows.map(r => r.user_id))];
  const eventIds = [...new Set(rows.map(r => r.event_id))];

  const [{ data: prefsRows }, { data: eventRows }] = await Promise.all([
    admin.from("alert_preferences").select("user_id, channels, quiet_hours").in("user_id", userIds),
    admin.from("alert_events").select("id, user_id, source, severity, kind, symbol, title, message, payload").in("id", eventIds),
  ]);

  const prefsMap = new Map<string, PrefsRow>();
  (prefsRows ?? []).forEach((p: any) => prefsMap.set(p.user_id, p as PrefsRow));
  const eventMap = new Map<string, EventRow>();
  (eventRows ?? []).forEach((e: any) => eventMap.set(e.id, e as EventRow));

  let sent = 0, failed = 0, skipped = 0;

  for (const row of rows) {
    const prefs = prefsMap.get(row.user_id);
    const ev = eventMap.get(row.event_id);

    if (!prefs || !ev) {
      await admin.from("alert_dispatch_queue")
        .update({ status: "skipped", last_error: "prefs or event missing" })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    if (isQuietNow(prefs, ev.severity)) {
      // adia 15min
      const next = new Date(Date.now() + 15 * 60_000).toISOString();
      await admin.from("alert_dispatch_queue")
        .update({ next_attempt_at: next, last_error: "quiet_hours" })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    try {
      await deliver(row.channel as Channel, prefs, ev);
      await admin.from("alert_dispatch_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1 })
        .eq("id", row.id);
      // atualiza dispatch_state no evento
      await admin.rpc as unknown; // no-op placeholder
      const stateKey = row.channel;
      await admin.from("alert_events")
        .update({ dispatch_state: { [stateKey]: "sent" } as any })
        .eq("id", row.event_id);
      sent++;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const attempts = row.attempts + 1;
      const isTerminal = msg === "EMAIL_NOT_CONFIGURED" || attempts >= MAX_ATTEMPTS;
      const nextStatus = isTerminal ? (msg === "EMAIL_NOT_CONFIGURED" ? "skipped" : "failed") : "pending";
      const backoffMs = 60_000 * Math.pow(2, attempts); // 2m,4m,8m
      await admin.from("alert_dispatch_queue")
        .update({
          status: nextStatus,
          attempts,
          last_error: msg.slice(0, 500),
          next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
        })
        .eq("id", row.id);
      if (nextStatus === "failed") failed++;
      else if (nextStatus === "skipped") skipped++;
    }
  }

  return { processed: rows.length, sent, failed, skipped };
}
