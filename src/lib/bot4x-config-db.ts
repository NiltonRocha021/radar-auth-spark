// Leitura e escrita da configuração Bot4x por usuário no Supabase.
// A tabela bot4x_configs já existe com RLS por user_id.
//
// ARCH-02 (migração 2026-06): agora usamos colunas com nomes semânticos
// corretos (sl_pct, tp_pct, allocation_pct, total_capital, preferred_pairs,
// avoid_pairs). As colunas antigas reaproveitadas (rsi_threshold_low/high,
// ai_score_min, fomo_limit, exchange) permanecem por compatibilidade e
// serão dropadas em migração futura. A leitura faz fallback para elas
// caso uma linha legada não tenha sido alcançada pelo backfill.
import { supabase } from "@/integrations/supabase/client";

export interface Bot4xConfigRow {
  userId: string;
  active: boolean;
  profile: string;
  leverage: number;
  activeCapital: number;
  slPct: number;
  tpPct: number;
  allocationPct: number;
  totalCapital: number;
  preferredPairs: string[];
  avoidPairs: string[];
  circuitBreaker: string;
  dailyPnl: number;
  openSlots: number;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

// Fallback legado: a coluna `exchange` (text) costumava serializar
// {preferred, avoid} ou um array puro.
function parseLegacyPairs(value: unknown): { preferred: string[]; avoid: string[] } {
  if (typeof value !== "string" || !value) return { preferred: [], avoid: [] };
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return { preferred: asStringArray(parsed), avoid: [] };
    }
    if (parsed && typeof parsed === "object") {
      return {
        preferred: asStringArray((parsed as Record<string, unknown>).preferred),
        avoid: asStringArray((parsed as Record<string, unknown>).avoid),
      };
    }
  } catch {
    /* fallthrough */
  }
  return { preferred: [], avoid: [] };
}

export async function loadConfig(userId: string): Promise<Bot4xConfigRow | null> {
  const { data, error } = await supabase
    .from("bot4x_configs")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[bot4x-config-db] loadConfig error:", error.message);
    return null;
  }
  if (!data) return null;

  // Pares: novo formato primeiro, legado como fallback.
  const newPreferred = asStringArray(data.preferred_pairs);
  const newAvoid = asStringArray(data.avoid_pairs);
  const legacy = newPreferred.length === 0 && newAvoid.length === 0
    ? parseLegacyPairs(data.exchange)
    : { preferred: newPreferred, avoid: newAvoid };

  return {
    userId: data.user_id,
    active: data.active,
    profile: data.profile,
    leverage: data.leverage ?? 3,
    activeCapital: Number(data.active_capital ?? 0),
    slPct: data.sl_pct != null
      ? Number(data.sl_pct)
      : data.rsi_threshold_low != null ? Number(data.rsi_threshold_low) : 0.5,
    tpPct: data.tp_pct != null
      ? Number(data.tp_pct)
      : data.rsi_threshold_high != null ? Number(data.rsi_threshold_high) : 1.0,
    allocationPct: data.allocation_pct ?? data.ai_score_min ?? 30,
    totalCapital: data.total_capital != null
      ? Number(data.total_capital)
      : data.fomo_limit != null ? Number(data.fomo_limit) : 1000,
    preferredPairs: legacy.preferred,
    avoidPairs: legacy.avoid,
    circuitBreaker: data.circuit_breaker ?? "none",
    dailyPnl: Number(data.daily_pnl ?? 0),
    openSlots: data.open_slots ?? 0,
  };
}

export async function saveConfig(userId: string, config: Partial<Bot4xConfigRow>): Promise<void> {
  const row: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  if (config.active !== undefined) row.active = config.active;
  if (config.profile !== undefined) row.profile = config.profile;
  if (config.leverage !== undefined) row.leverage = config.leverage;
  if (config.activeCapital !== undefined) row.active_capital = config.activeCapital;
  if (config.circuitBreaker !== undefined) row.circuit_breaker = config.circuitBreaker;
  if (config.dailyPnl !== undefined) row.daily_pnl = config.dailyPnl;
  if (config.openSlots !== undefined) row.open_slots = config.openSlots;

  // Novas colunas com nomes corretos.
  if (config.slPct !== undefined) row.sl_pct = config.slPct;
  if (config.tpPct !== undefined) row.tp_pct = config.tpPct;
  if (config.allocationPct !== undefined) row.allocation_pct = config.allocationPct;
  if (config.totalCapital !== undefined) row.total_capital = config.totalCapital;
  if (config.preferredPairs !== undefined) row.preferred_pairs = config.preferredPairs;
  if (config.avoidPairs !== undefined) row.avoid_pairs = config.avoidPairs;

  const { error } = await supabase
    .from("bot4x_configs")
    .upsert(row, { onConflict: "user_id" });
  if (error) console.error("[bot4x-config-db] saveConfig error:", error.message);
}
