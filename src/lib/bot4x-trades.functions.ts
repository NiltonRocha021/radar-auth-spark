import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Trade } from "./bot4x-data";
import type { Database, Json } from "@/integrations/supabase/types";

const TradeSchema = z.object({
  id: z.string().min(1),
  day: z.string(),
  pair: z.string().min(1),
  side: z.enum(["LONG", "SHORT"]),
  entry: z.number(),
  stop: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  result: z.enum(["WIN", "LOSS", "BLOCKED", "OPEN"]),
  pnl: z.number(),
  pnlPct: z.number(),
  accumulated: z.number().optional(),
  profile: z.string().nullable().optional(),
  leverage: z.number().nullable().optional(),
  motivo: z.string().nullable().optional(),
  hour: z.number().nullable().optional(),
});

function toRow(trade: z.infer<typeof TradeSchema>, userId: string) {
  return {
    id: trade.id,
    user_id: userId,
    day: trade.day,
    pair: trade.pair,
    side: trade.side,
    entry: trade.entry,
    stop: trade.stop ?? null,
    target: trade.target ?? null,
    result: trade.result,
    pnl: trade.pnl,
    pnl_pct: trade.pnlPct,
    accumulated: trade.accumulated ?? 0,
    profile: trade.profile ?? null,
    leverage: trade.leverage ?? null,
    motivo: trade.motivo ?? null,
    hour: trade.hour ?? null,
  };
}

export const saveBot4xTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TradeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bot4x_trades")
      .upsert(toRow(data, context.userId), { onConflict: "id" });
    if (error) throw new Error(`Falha ao salvar trade ${data.id}: ${error.message}`);
  });

export const saveBot4xTradeWithOutbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TradeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tradeData = data as unknown as Json;
    const { data: outbox, error: outboxError } = await supabaseAdmin
      .from("trade_outbox")
      .insert({
        user_id: context.userId,
        trade_data: tradeData,
        status: "pending",
      })
      .select("id")
      .single();
    if (outboxError || !outbox) {
      throw outboxError ?? new Error("outbox insert returned no row");
    }

    const { error: tradeError } = await supabaseAdmin
      .from("bot4x_trades")
      .upsert(toRow(data, context.userId), { onConflict: "id" });

    if (tradeError) {
      throw new Error(`Falha ao salvar trade ${data.id}: ${tradeError.message}`);
    }

    const { error: markError } = await supabaseAdmin
      .from("trade_outbox")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", outbox.id);
    if (markError) throw new Error(`Trade salvo, mas outbox não foi atualizado: ${markError.message}`);
  });

export const loadBot4xTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { limitDays?: number }) =>
    z.object({ limitDays: z.number().int().min(1).max(365).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<Trade[]> => {
    const since = new Date();
    since.setDate(since.getDate() - (data.limitDays ?? 90));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("bot4x_trades")
      .select("*")
      .eq("user_id", context.userId)
      .gte("day", since.toISOString().slice(0, 10))
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    return (rows ?? []).map((r) => ({
      id: r.id,
      day: r.day,
      pair: r.pair,
      side: r.side as Trade["side"],
      entry: Number(r.entry),
      stop: r.stop != null ? Number(r.stop) : 0,
      target: r.target != null ? Number(r.target) : 0,
      result: r.result as Trade["result"],
      pnl: Number(r.pnl),
      pnlPct: Number(r.pnl_pct),
      accumulated: Number(r.accumulated),
      profile: (r.profile ?? "conservador") as Trade["profile"],
      leverage: r.leverage ?? 1,
      motivo: r.motivo ?? "",
      hour: r.hour ?? 0,
    }));
  });

export const deleteBot4xTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tradeId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bot4x_trades")
      .delete()
      .eq("id", data.tradeId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
  });
