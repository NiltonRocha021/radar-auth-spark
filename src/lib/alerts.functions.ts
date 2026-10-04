// Server functions do módulo de Alertas.
// - Preferências (channels, quiet_hours, thresholds, +extensões via JSONB)
// - Feed (alert_events)
// - Test alert (cria evento + enfileira dispatch)
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function isOfficialDiscordWebhook(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "discord.com" &&
      url.port === "" &&
      /^\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9._-]{20,}$/.test(url.pathname) &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

// -------------------- Types (shape do JSONB, além do default) --------------------
export type AlertChannels = {
  telegram: { enabled: boolean; chat_id: string | null };
  email: { enabled: boolean; address: string | null };
  discord: { enabled: boolean; webhook_url: string | null };
  push?: { enabled: boolean };
  whatsapp?: { enabled: boolean };
};

export type AlertQuietHours = {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
};

export type AlertThresholds = {
  min_confidence: number;
  symbols: string[];
  severities: string[];
  sources: string[];
  // extensões UI
  types?: Record<string, boolean>;
  frequency?: "realtime" | "15min" | "hourly" | "daily";
  assets?: string[];
  bot4x?: boolean;
};

export type AlertPreferences = {
  id: string;
  user_id: string;
  channels: AlertChannels;
  quiet_hours: AlertQuietHours;
  thresholds: AlertThresholds;
  updated_at: string;
};

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type AlertEvent = {
  id: string;
  source: "signal" | "trade" | "system";
  severity: "info" | "warning" | "critical";
  kind: string;
  symbol: string | null;
  title: string;
  message: string;
  payload: JsonValue;
  read_at: string | null;
  created_at: string;
};



// -------------------- getAlertPreferences --------------------
export const getAlertPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data, error } = await supabase
      .from("alert_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data as unknown as AlertPreferences;

    // upsert default row on first read
    const { data: inserted, error: insErr } = await supabase
      .from("alert_preferences")
      .insert({ user_id: userId })
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);
    return inserted as unknown as AlertPreferences;
  });

// -------------------- saveAlertPreferences --------------------
export const saveAlertPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    channels?: Partial<AlertChannels>;
    quiet_hours?: Partial<AlertQuietHours>;
    thresholds?: Partial<AlertThresholds>;
  }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const discordWebhook = data.channels?.discord?.webhook_url;
    if (discordWebhook != null && !isOfficialDiscordWebhook(discordWebhook)) {
      throw new Error("Use uma URL oficial de webhook do Discord.");
    }

    // read current then merge (server-side, so client never overwrites blindly)
    const { data: current } = await supabase
      .from("alert_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const merged = {
      user_id: userId,
      channels: { ...(current?.channels as object ?? {}), ...(data.channels ?? {}) },
      quiet_hours: { ...(current?.quiet_hours as object ?? {}), ...(data.quiet_hours ?? {}) },
      thresholds: { ...(current?.thresholds as object ?? {}), ...(data.thresholds ?? {}) },
    };

    const { data: saved, error } = await supabase
      .from("alert_preferences")
      .upsert(merged, { onConflict: "user_id" })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return saved as unknown as AlertPreferences;
  });

// -------------------- getAlertFeed --------------------
export const getAlertFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const limit = Math.min(Math.max(data.limit ?? 50, 1), 200);

    const { data: rows, error } = await supabase
      .from("alert_events")
      .select("id, source, severity, kind, symbol, title, message, payload, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as AlertEvent[];
  });

// -------------------- markAlertRead / markAllAlertsRead --------------------
export const markAlertRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("alert_events")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllAlertsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("alert_events")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearAlertFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Precisa de service_role para deletar (policy só permite SELECT/UPDATE ao user).
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("alert_events")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- sendTestAlert --------------------
// Cria um alert_event + enfileira em alert_dispatch_queue para cada canal ativo.
export const sendTestAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;

    // 1) lê prefs do próprio user via RLS
    const { data: prefs, error: prefsErr } = await supabase
      .from("alert_preferences")
      .select("channels")
      .eq("user_id", userId)
      .maybeSingle();
    if (prefsErr) throw new Error(prefsErr.message);

    const channels = (prefs?.channels ?? {}) as AlertChannels;
    if (
      channels.discord?.enabled &&
      (!channels.discord.webhook_url || !isOfficialDiscordWebhook(channels.discord.webhook_url))
    ) {
      throw new Error("O webhook do Discord precisa usar uma URL oficial do Discord.");
    }
    const activeChannels = (["telegram", "email", "discord"] as const).filter(
      (c) => (channels as Record<string, { enabled?: boolean }>)[c]?.enabled,
    );

    if (activeChannels.length === 0) {
      throw new Error("No channels enabled. Turn on at least one channel first.");
    }

    // 2) cria event + queue via service_role (RLS bloqueia insert por authenticated)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: event, error: evErr } = await supabaseAdmin
      .from("alert_events")
      .insert({
        user_id: userId,
        source: "system",
        severity: "info",
        kind: "test",
        symbol: "BTC/USDT",
        title: "Test alert",
        message: `Sample notification via ${activeChannels.join(", ")}.`,
        payload: { test: true },
      })
      .select("id")
      .single();

    if (evErr) throw new Error(evErr.message);

    const queueRows = activeChannels.map((channel) => ({
      event_id: event.id,
      user_id: userId,
      channel,
      status: "pending" as const,
    }));

    const { error: qErr } = await supabaseAdmin
      .from("alert_dispatch_queue")
      .insert(queueRows);

    if (qErr) throw new Error(qErr.message);

    // 3) tenta drenar imediatamente (best-effort, sem esperar)
    try {
      const { drainDispatchQueue } = await import("./alerts-dispatch.server");
      await drainDispatchQueue({ userId, limit: 5 });
    } catch (e) {
      // log-only; cron ainda vai processar
      console.error("[sendTestAlert] immediate drain failed:", e);
    }

    return { ok: true, eventId: event.id, channels: activeChannels };
  });
