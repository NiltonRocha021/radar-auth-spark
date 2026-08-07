// Lógica do Bot4x Calibration Engine (BCE) — server-only.
// Substitui o endpoint /calibrator/state do NestJS: o estado agora é derivado
// dos dados que já temos no banco (config + trades do dia).
import type { CalibratorState, CalibratorStateUI, CalibratorTradeAllowance, SimulationProfile } from "./calibrator";

type ConfigRow = {
  profile: string | null;
  daily_pnl: number | null;
  open_slots: number | null;
  circuit_breaker: string | null;
  updated_at: string | null;
};

type TradeRow = { result: string | null; pnl_pct: number | null };

const PROFILES: SimulationProfile[] = [
  "conservador",
  "rsi",
  "aiscore",
  "agressivo",
  "scalper",
  "intraday",
  "swing",
  "position",
];

function normalizeProfile(p: string | null): SimulationProfile | undefined {
  if (!p) return undefined;
  if (p === "calibradoRSI") return "rsi";
  if (p === "calibradoAiScore") return "aiscore";
  return PROFILES.includes(p as SimulationProfile) ? (p as SimulationProfile) : undefined;
}

function classify(dailyPnlPct: number, losingStreak: number, circuitBreaker: string | null) {
  let state: CalibratorState = "OPTIMAL";
  let riskMultiplier = 1;
  let tradeAllowance: CalibratorTradeAllowance = "HIGH";
  const flags: string[] = [];
  const actions: string[] = [];

  if (circuitBreaker && circuitBreaker !== "none") {
    state = "SHUTDOWN";
    riskMultiplier = 0;
    tradeAllowance = "BLOCKED";
    flags.push("circuit_breaker");
    actions.push("Aguardar reset diário ou reativar manualmente o bot.");
  } else if (dailyPnlPct <= -1.5) {
    state = "PROTECTION";
    riskMultiplier = 0.25;
    tradeAllowance = "BLOCKED";
    flags.push("daily_loss_limit");
    actions.push("Encerrar operações do dia e revisar o perfil de risco.");
  } else if (dailyPnlPct <= -0.8 || losingStreak >= 3) {
    state = "RISK_DRIFT";
    riskMultiplier = 0.5;
    tradeAllowance = "LOW";
    if (losingStreak >= 3) flags.push("losing_streak");
    actions.push("Reduzir tamanho de posição até recuperar consistência.");
  } else if (dailyPnlPct <= -0.3) {
    state = "WARNING";
    riskMultiplier = 0.75;
    tradeAllowance = "MEDIUM";
    actions.push("Operar apenas setups de alta confluência.");
  }

  return { state, riskMultiplier, tradeAllowance, flags, actions };
}

export async function computeCalibratorState(
  supabase: {
    from: (table: string) => any;
  },
  userId: string,
): Promise<CalibratorStateUI> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [{ data: cfg }, { data: trades }] = await Promise.all([
    supabase
      .from("bot4x_configs")
      .select("profile,daily_pnl,open_slots,circuit_breaker,updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("bot4x_trades")
      .select("result,pnl_pct")
      .eq("user_id", userId)
      .gte("created_at", startOfDay.toISOString())
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const config = (cfg ?? null) as ConfigRow | null;
  const rows = ((trades ?? []) as TradeRow[]).filter((t) => t.result === "WIN" || t.result === "LOSS");

  let losingStreak = 0;
  for (const t of rows) {
    if (t.result === "LOSS") losingStreak += 1;
    else break;
  }

  const dailyPnlPct = rows.reduce((acc, t) => acc + Number(t.pnl_pct ?? 0), 0);
  const { state, riskMultiplier, tradeAllowance, flags, actions } = classify(
    dailyPnlPct,
    losingStreak,
    config?.circuit_breaker ?? null,
  );

  return {
    state,
    riskMultiplier,
    tradeAllowance,
    behavioralFlags: flags,
    actions,
    dnaFeedback: {
      patternDetected: losingStreak >= 3 ? `Sequência de ${losingStreak} perdas consecutivas` : "",
      correction: losingStreak >= 3 ? "Pausar e reavaliar critérios de entrada" : "",
      expectedImprovement: losingStreak >= 3 ? "Redução do drawdown diário" : "",
    },
    commentary:
      state === "OPTIMAL"
        ? "Operação dentro dos parâmetros calibrados."
        : `PnL do dia em ${dailyPnlPct.toFixed(2)}% — risco ajustado para ${(riskMultiplier * 100).toFixed(0)}%.`,
    profile: normalizeProfile(config?.profile ?? null),
    updatedAt: config?.updated_at ?? new Date().toISOString(),
  };
}
