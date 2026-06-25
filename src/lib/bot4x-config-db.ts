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
  const row = {
    user_id: userId,
    updated_at: new Date().toISOString(),
    ...(config.active !== undefined && { active: config.active }),
    ...(config.profile !== undefined && { profile: config.profile }),
    ...(config.leverage !== undefined && { leverage: config.leverage }),
    ...(config.activeCapital !== undefined && { active_capital: config.activeCapital }),
    ...(config.slPct !== undefined && { rsi_threshold_low: config.slPct }),
    ...(config.tpPct !== undefined && { rsi_threshold_high: config.tpPct }),
    ...(config.allocationPct !== undefined && { ai_score_min: config.allocationPct }),
    ...(config.totalCapital !== undefined && { fomo_limit: config.totalCapital }),
    ...(config.preferredPairs !== undefined && { exchange: JSON.stringify(config.preferredPairs) }),
    ...(config.circuitBreaker !== undefined && { circuit_breaker: config.circuitBreaker }),
    ...(config.dailyPnl !== undefined && { daily_pnl: config.dailyPnl }),
    ...(config.openSlots !== undefined && { open_slots: config.openSlots }),
  };

  const { error } = await supabase
    .from("bot4x_configs")
    .upsert(row, { onConflict: "user_id" });
  if (error) console.error("[bot4x-config-db] saveConfig error:", error.message);
}
