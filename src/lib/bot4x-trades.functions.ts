import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Trade } from "./bot4x-data";
import type { Json } from "@/integrations/supabase/types";

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

async function persistTrade(
  data: z.infer<typeof TradeSchema>,
  userId: string,
  withOutbox: boolean,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { error } = await supabaseAdmin.rpc("save_bot4x_trade", {
    p_user_id: userId,
    p_id: data.id,
    p_day: data.day,
    p_pair: data.pair,
    p_side: data.side,
    p_entry: data.entry,
    p_stop: data.stop ?? null,
    p_target: data.target ?? null,
    p_result: data.result,
    p_pnl: data.pnl,
    p_pnl_pct: data.pnlPct,
    p_accumulated: data.accumulated ?? 0,
    p_profile: data.profile ?? null,
    p_leverage: data.leverage ?? null,
    p_motivo: data.motivo ?? null,
    p_hour: data.hour ?? null,
    p_with_outbox: withOutbox,
    p_trade_data: data as unknown as Json,
  });

  if (error) {
    throw new Error(
      error.code === "P0001" && error.message === "Trade ownership conflict"
        ? "Trade inválido."
        : `Falha ao salvar trade ${data.id}: ${error.message}`,
    );
  }
}

export const saveBot4xTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TradeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await persistTrade(data, context.userId, false);
  });

export const saveBot4xTradeWithOutbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TradeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await persistTrade(data, context.userId, true);
  });

export const loadBot4xTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { limitDays?: number }) =>
    z.object({ limitDays: z.number().int().min(1).max(365).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<Trade[]> => {
    const since = new Date();
    since.setDate(since.getDate() - (data.limitDays ?? 90));

    const { data: rows, error } = await context.supabase
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
