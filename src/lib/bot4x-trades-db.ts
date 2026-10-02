// Persistência do histórico de trades no Supabase.
// Chamado pelo bot4x-store ao fechar uma ordem (SL/TP atingido).
// Separado do store para manter o store simples e testável.
import { supabase } from "@/integrations/supabase/client";
import type { Trade } from "./bot4x-data";
import { logger } from "./logger";

export async function saveTrade(_userId: string, trade: Trade): Promise<void> {
  const { saveBot4xTrade } = await import("./bot4x-trades.functions");
  try {
    await saveBot4xTrade({
      id: trade.id,
      day: trade.day,
      pair: trade.pair,
      side: trade.side,
      entry: trade.entry,
      stop: trade.stop ?? null,
      target: trade.target ?? null,
      result: trade.result,
      pnl: trade.pnl,
      pnlPct: trade.pnlPct,
      accumulated: trade.accumulated ?? 0,
      profile: trade.profile ?? null,
      leverage: trade.leverage ?? null,
      motivo: trade.motivo ?? null,
      hour: trade.hour ?? null,
    });
  } catch (error) {
    logger.error("[bot4x-trades-db] saveTrade error", { tradeId: trade.id, error });
    throw error;
  }
}

export async function saveTradeWithOutbox(_userId: string, trade: Trade): Promise<void> {
  const { saveBot4xTradeWithOutbox } = await import("./bot4x-trades.functions");
  await saveBot4xTradeWithOutbox({
    id: trade.id,
    day: trade.day,
    pair: trade.pair,
    side: trade.side,
    entry: trade.entry,
    stop: trade.stop ?? null,
    target: trade.target ?? null,
    result: trade.result,
    pnl: trade.pnl,
    pnlPct: trade.pnlPct,
    accumulated: trade.accumulated ?? 0,
    profile: trade.profile ?? null,
    leverage: trade.leverage ?? null,
    motivo: trade.motivo ?? null,
    hour: trade.hour ?? null,
  });
}

export async function loadTrades(_userId: string, limitDays = 90): Promise<Trade[]> {
  const { loadBot4xTrades } = await import("./bot4x-trades.functions");
  return loadBot4xTrades({ limitDays });
}

export async function deleteTrade(_userId: string, tradeId: string): Promise<void> {
  const { deleteBot4xTrade } = await import("./bot4x-trades.functions");
  await deleteBot4xTrade({ tradeId });
}
