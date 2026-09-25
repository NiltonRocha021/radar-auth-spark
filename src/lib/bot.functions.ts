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
  executionMode: "DEMO" | "LIVE";
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
  execution_mode: string | null;
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
        "active,profile,rsi_threshold_low,rsi_threshold_high,ai_score_min,fomo_limit,leverage,active_capital,total_capital,allocation_pct,sl_pct,tp_pct,daily_pnl,open_slots,total_trades_today,circuit_breaker,exchange,api_key_set,preferred_pairs,avoid_pairs,execution_mode,updated_at",
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
      executionMode: r.execution_mode === "LIVE" ? "LIVE" : "DEMO",
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

// =========================================================================
// Fase 3 — writes: updateBotConfig, startBot, stopBot, getBotState, getExecutions
// =========================================================================

const BOT_PROFILES = ["CONSERVATIVE", "MODERATE", "AGGRESSIVE"] as const;
const EXCHANGES = ["binance", "bybit", "okx", "bitget"] as const;

// Espelha UpdateBotConfigDto do Nest (todos os campos opcionais; PATCH parcial).
const UpdateBotConfigSchema = z
  .object({
    active: z.boolean().optional(),
    profile: z.enum(BOT_PROFILES).optional(),
    rsiThresholdLow: z.number().min(0).max(100).optional(),
    rsiThresholdHigh: z.number().min(0).max(100).optional(),
    aiScoreMin: z.number().int().min(0).max(100).optional(),
    fomoLimit: z.number().min(0).max(100).optional(),
    leverage: z.number().int().min(1).max(125).optional(),
    activeCapital: z.number().min(0).optional(),
    totalCapital: z.number().min(0).optional(),
    allocationPct: z.number().int().min(1).max(100).optional(),
    slPct: z.number().min(0).max(100).optional(),
    tpPct: z.number().min(0).max(100).optional(),
    exchange: z.enum(EXCHANGES).optional(),
    apiKeySet: z.boolean().optional(),
    executionMode: z.enum(["DEMO", "LIVE"]).optional(),
    preferredPairs: z.array(z.string().trim().min(3).max(20)).max(50).optional(),
    avoidPairs: z.array(z.string().trim().min(3).max(20)).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nenhum campo informado");

export const updateBotConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateBotConfigSchema.parse(d))
  .handler(async ({ data, context }): Promise<BotConfigDTO> => {
    // camelCase (DTO) -> snake_case (coluna)
    const patch: Record<string, unknown> = { user_id: context.userId };
    const map: Record<string, string> = {
      active: "active",
      profile: "profile",
      rsiThresholdLow: "rsi_threshold_low",
      rsiThresholdHigh: "rsi_threshold_high",
      aiScoreMin: "ai_score_min",
      fomoLimit: "fomo_limit",
      leverage: "leverage",
      activeCapital: "active_capital",
      totalCapital: "total_capital",
      allocationPct: "allocation_pct",
      slPct: "sl_pct",
      tpPct: "tp_pct",
      exchange: "exchange",
      apiKeySet: "api_key_set",
      executionMode: "execution_mode",
      preferredPairs: "preferred_pairs",
      avoidPairs: "avoid_pairs",
    };
    for (const [k, col] of Object.entries(map)) {
      if (k in data) patch[col] = (data as Record<string, unknown>)[k];
    }

    if (data.executionMode === "LIVE") {
      const { getBinanceCredentialMetadata } = await import("./binance-credentials.server");
      const credentials = await getBinanceCredentialMetadata(context.userId);
      if (credentials?.status !== "valid") throw new Error("Valide suas credenciais Binance antes de selecionar REAL.");
    }
    const { error } = await context.supabase
      .from("bot4x_configs")
      .upsert(patch as never, { onConflict: "user_id" });
    if (error) throw new Error("Falha ao salvar config: " + error.message);

    // Retorna estado consolidado usando a leitura já pronta.
    const cur = await getBotConfig();
    if (!cur) throw new Error("Config sumiu após upsert");
    return cur;
  });

// ---------- bot state (start/stop) ----------------------------------------

export type BotState = "ACTIVE" | "INACTIVE" | "PAUSED";

export interface BotStateDTO {
  state: BotState;
  reason: string | null;
  changedAt: string;
}

async function setBotState(
  context: { supabase: any; userId: string },
  state: BotState,
  reason: string | null,
): Promise<BotStateDTO> {
  const now = new Date().toISOString();
  const { data, error } = await context.supabase
    .from("bot_system_state")
    .upsert(
      { user_id: context.userId, state, reason, changed_at: now },
      { onConflict: "user_id" },
    )
    .select("state,reason,changed_at")
    .single();
  if (error) throw new Error("Falha ao atualizar estado: " + error.message);

  // Espelha em event_log (auditoria unificada — não usamos audit_log separado).
  await context.supabase.from("event_log").insert({
    user_id: context.userId,
    event_type: `bot.state.${state.toLowerCase()}`,
    source: "bot.functions",
    payload: { reason },
  });

  return {
    state: data.state as BotState,
    reason: (data.reason as string | null) ?? null,
    changedAt: String(data.changed_at),
  };
}

export const getBotState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BotStateDTO> => {
    const { data, error } = await context.supabase
      .from("bot_system_state")
      .select("state,reason,changed_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { state: "INACTIVE", reason: null, changedAt: new Date().toISOString() };
    return {
      state: data.state as BotState,
      reason: (data.reason as string | null) ?? null,
      changedAt: String(data.changed_at),
    };
  });

export const startBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { reason?: string }) =>
    z.object({ reason: z.string().trim().max(200).optional() }).parse(d ?? {}),
  )
  .handler(({ data, context }) => setBotState(context, "ACTIVE", data.reason ?? null));

export const stopBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { reason?: string }) =>
    z.object({ reason: z.string().trim().max(200).optional() }).parse(d ?? {}),
  )
  .handler(({ data, context }) => setBotState(context, "INACTIVE", data.reason ?? null));

// ---------- getExecutions -------------------------------------------------
// Leitura das execuções do bot (bot4x_trades). Fica aqui em vez de em Fase 2
// porque é o par natural de startBot/stopBot na mesma tela.

export interface BotExecutionDTO {
  id: string;
  day: string;
  pair: string;
  side: string;
  entry: number;
  stop: number | null;
  target: number | null;
  result: string | null;
  pnl: number | null;
  pnlPct: number | null;
  profile: string | null;
  leverage: number | null;
  createdAt: string;
}

export const getBotExecutions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { limit?: number }) =>
    z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<BotExecutionDTO[]> => {
    const { data: rows, error } = await context.supabase
      .from("bot4x_trades")
      .select(
        "id,day,pair,side,entry,stop,target,result,pnl,pnl_pct,profile,leverage,created_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: String(r.id),
      day: String(r.day),
      pair: String(r.pair),
      side: String(r.side),
      entry: Number(r.entry),
      stop: r.stop != null ? Number(r.stop) : null,
      target: r.target != null ? Number(r.target) : null,
      result: r.result ?? null,
      pnl: r.pnl != null ? Number(r.pnl) : null,
      pnlPct: r.pnl_pct != null ? Number(r.pnl_pct) : null,
      profile: r.profile ?? null,
      leverage: r.leverage != null ? Number(r.leverage) : null,
      createdAt: String(r.created_at),
    }));
  });
