// Server function de leitura de config do bot.
// Porta Bot4xController.getConfig (GET /bot4x/config). Apenas leitura;
// start/stop/patch config vão para a Fase 3.
//
// Regra SEC (Fase R): userId vem SEMPRE de context.userId; não aceitamos
// userId via argumento. Isso fecha o IDOR que o Nest já corrigiu removendo
// /config/:userId.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface BotConfigDTO {
  active: boolean;
  profile: string | null;
  rsiThresholdLow: number | null;
  rsiThresholdHigh: number | null;
  aiScoreMin: number | null;
  fomoLimit: number | null;
  leverage: number | null;
  activeCapital: number | null;
  totalCapital: number | null;
  allocationPct: number | null;
  slPct: number | null;
  tpPct: number | null;
  dailyPnl: number | null;
  openSlots: number | null;
  totalTradesToday: number | null;
  circuitBreaker: string | null;
  exchange: string | null;
  apiKeySet: boolean;
  preferredPairs: string[] | null;
  avoidPairs: string[] | null;
  updatedAt: string | null;
}

type ConfigRow = {
  active: boolean | null;
  profile: string | null;
  rsi_threshold_low: number | null;
  rsi_threshold_high: number | null;
  ai_score_min: number | null;
  fomo_limit: number | null;
  leverage: number | null;
  active_capital: number | null;
  total_capital: number | null;
  allocation_pct: number | null;
  sl_pct: number | null;
  tp_pct: number | null;
  daily_pnl: number | null;
  open_slots: number | null;
  total_trades_today: number | null;
  circuit_breaker: string | null;
  exchange: string | null;
  api_key_set: boolean | null;
  preferred_pairs: unknown;
  avoid_pairs: unknown;
  updated_at: string | null;
};

function coerceStringArray(v: unknown): string[] | null {
  if (Array.isArray(v)) return v.map(String);
  return null;
}

/**
 * GET /bot4x/config — retorna a config do usuário atual.
 * Retorna null (não cria row default) quando o usuário ainda não passou pelo
 * onboarding. A criação de defaults fica para o fluxo de onboarding, não
 * para uma rota GET, evitando efeitos colaterais em leituras.
 */
export const getBotConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotConfigDTO | null> => {
    const { data, error } = await context.supabase
      .from("bot4x_configs")
      .select(
        "active,profile,rsi_threshold_low,rsi_threshold_high,ai_score_min,fomo_limit,leverage,active_capital,total_capital,allocation_pct,sl_pct,tp_pct,daily_pnl,open_slots,total_trades_today,circuit_breaker,exchange,api_key_set,preferred_pairs,avoid_pairs,updated_at",
      )
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) {
      console.warn("[bot.functions] getBotConfig error:", error.message);
      return null;
    }
    if (!data) return null;
    const r = data as ConfigRow;
    return {
      active: Boolean(r.active),
      profile: r.profile,
      rsiThresholdLow: r.rsi_threshold_low != null ? Number(r.rsi_threshold_low) : null,
      rsiThresholdHigh: r.rsi_threshold_high != null ? Number(r.rsi_threshold_high) : null,
      aiScoreMin: r.ai_score_min != null ? Number(r.ai_score_min) : null,
      fomoLimit: r.fomo_limit != null ? Number(r.fomo_limit) : null,
      leverage: r.leverage != null ? Number(r.leverage) : null,
      activeCapital: r.active_capital != null ? Number(r.active_capital) : null,
      totalCapital: r.total_capital != null ? Number(r.total_capital) : null,
      allocationPct: r.allocation_pct != null ? Number(r.allocation_pct) : null,
      slPct: r.sl_pct != null ? Number(r.sl_pct) : null,
      tpPct: r.tp_pct != null ? Number(r.tp_pct) : null,
      dailyPnl: r.daily_pnl != null ? Number(r.daily_pnl) : null,
      openSlots: r.open_slots != null ? Number(r.open_slots) : null,
      totalTradesToday: r.total_trades_today != null ? Number(r.total_trades_today) : null,
      circuitBreaker: r.circuit_breaker,
      exchange: r.exchange,
      apiKeySet: Boolean(r.api_key_set),
      preferredPairs: coerceStringArray(r.preferred_pairs),
      avoidPairs: coerceStringArray(r.avoid_pairs),
      updatedAt: r.updated_at,
    };
  });
