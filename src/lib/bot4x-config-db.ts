// Leitura e escrita da configuração Bot4x por usuário no Supabase.
// A tabela bot4x_configs já existe com RLS por user_id.
// Reutilizamos colunas existentes com mapeamento semântico (sem alterar schema).
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

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
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

  return {
    userId: data.user_id,
    active: data.active,
    profile: data.profile,
    leverage: data.leverage ?? 3,
    activeCapital: Number(data.active_capital ?? 0),
    // rsi_threshold_low/high reutilizados como sl/tp proxy
    slPct: data.rsi_threshold_low != null ? Number(data.rsi_threshold_low) : 0.5,
    tpPct: data.rsi_threshold_high != null ? Number(data.rsi_threshold_high) : 1.0,
    // ai_score_min reutilizado como allocationPct proxy
    allocationPct: data.ai_score_min ?? 30,
    // fomo_limit reutilizado como totalCapital proxy
    totalCapital: data.fomo_limit != null ? Number(data.fomo_limit) : 1000,
    // exchange (text) usado como JSON serializado de preferredPairs
    preferredPairs: parseJsonArray(data.exchange),
    // Sem coluna dedicada para avoidPairs — não persistido no schema atual
    avoidPairs: [],
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
  if (config.slPct !== undefined) row.rsi_threshold_low = config.slPct;
  if (config.tpPct !== undefined) row.rsi_threshold_high = config.tpPct;
  if (config.allocationPct !== undefined) row.ai_score_min = config.allocationPct;
  if (config.totalCapital !== undefined) row.fomo_limit = config.totalCapital;
  if (config.preferredPairs !== undefined) row.exchange = JSON.stringify(config.preferredPairs);
  if (config.circuitBreaker !== undefined) row.circuit_breaker = config.circuitBreaker;
  if (config.dailyPnl !== undefined) row.daily_pnl = config.dailyPnl;
  if (config.openSlots !== undefined) row.open_slots = config.openSlots;

  const { error } = await supabase
    .from("bot4x_configs")
    .upsert(row, { onConflict: "user_id" });
  if (error) console.error("[bot4x-config-db] saveConfig error:", error.message);
}
