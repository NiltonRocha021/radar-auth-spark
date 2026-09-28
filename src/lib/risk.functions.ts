// Server functions de risco.
// Porta RiskController do Nest (GET /risk/status, GET /risk/evaluate).
//
// Regra SEC (Fase R): userId vem SEMPRE de context.userId; nunca aceitamos
// userId por argumento. RLS de bot4x_configs / bot4x_trades / risk_audit
// já restringe ao dono, mas o handler ainda usa context.userId explicitamente
// nos filtros para clareza de auditoria.
//
// Cálculos derivados do RiskDataService.getRiskSnapshot original:
//   - dailyPnL: soma de pnl dos trades fechados hoje
//   - dailyPnLPct: dailyPnL / balance * 100
//   - highWaterMarkPct: maior soma cumulativa de pnl_pct no dia
//   - activePositions: trades sem resultado hoje (result IS NULL)
//   - totalBalance: bot4x_configs.total_capital (ou active_capital fallback)
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskStatusDTO {
  status: "ok" | "circuit_breaker";
  level: RiskLevel;
  message: string;
  snapshot: {
    dailyPnLPct: number;
    activePositions: number;
    highWaterMarkPct: number;
  };
  evaluatedAt: string;
}

export interface RiskEvaluateDTO {
  approved: boolean;
  level: RiskLevel;
  reasons: string[];
  snapshot: RiskStatusDTO["snapshot"] & {
    totalBalance: number;
    dailyPnL: number;
  };
  evaluatedAt: string;
}

type TradeRow = {
  result: string | null;
  pnl: number | null;
  pnl_pct: number | null;
  created_at: string | null;
};

async function loadSnapshot(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: unknown) => {
          gte?: (col: string, v: unknown) => { order?: (c: string, o: unknown) => Promise<{ data: unknown; error: unknown }>; maybeSingle?: () => Promise<{ data: unknown; error: unknown }> };
          order?: (c: string, o: unknown) => Promise<{ data: unknown; error: unknown }>;
          maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  },
  userId: string,
) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const isoStart = startOfDay.toISOString();

  // Balance a partir de bot4x_configs
  const { data: cfg } = await (supabase as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: { total_capital?: number | null; active_capital?: number | null } | null }> } } };
  })
    .from("bot4x_configs")
    .select("total_capital,active_capital")
    .eq("user_id", userId)
    .maybeSingle();

  const totalBalance = Number(cfg?.total_capital ?? cfg?.active_capital ?? 0);

  // Trades do dia
  const { data: trades } = await (supabase as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (c: string, v: unknown) => { gte: (c: string, v: unknown) => { order: (c: string, o: unknown) => Promise<{ data: TradeRow[] | null }> } } } };
  })
    .from("bot4x_trades")
    .select("result,pnl,pnl_pct,created_at")
    .eq("user_id", userId)
    .gte("created_at", isoStart)
    .order("created_at", { ascending: true });

  const rows = trades ?? [];
  const closed = rows.filter((t) => t.result === "WIN" || t.result === "LOSS");
  const activePositions = rows.filter((t) => t.result == null || t.result === "OPEN").length;
  const dailyPnL = closed.reduce((acc, t) => acc + Number(t.pnl ?? 0), 0);
  const dailyPnLPct = totalBalance > 0 ? (dailyPnL / totalBalance) * 100 : 0;

  let cum = 0;
  let highWater = 0;
  for (const t of rows) {
    cum += Number(t.pnl_pct ?? 0);
    if (cum > highWater) highWater = cum;
  }

  return { totalBalance, dailyPnL, dailyPnLPct, activePositions, highWaterMarkPct: highWater };
}

function classify(snapshot: {
  dailyPnLPct: number;
  activePositions: number;
}): { level: RiskLevel; message: string } {
  if (snapshot.dailyPnLPct <= -1.5) {
    return {
      level: "CRITICAL",
      message: `Circuit breaker ativo — perda diária: ${snapshot.dailyPnLPct.toFixed(2)}%`,
    };
  }
  if (snapshot.dailyPnLPct <= -1.0) {
    return {
      level: "HIGH",
      message: `Risco elevado — PnL do dia: ${snapshot.dailyPnLPct.toFixed(2)}%`,
    };
  }
  if (snapshot.dailyPnLPct <= -0.5 || snapshot.activePositions > 10) {
    return {
      level: "MEDIUM",
      message: `Monitoramento ativo — posições abertas: ${snapshot.activePositions}`,
    };
  }
  return { level: "LOW", message: "Sistema operando normalmente." };
}

export const getRiskStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RiskStatusDTO> => {
    const s = await loadSnapshot(context.supabase as never, context.userId);
    const { level, message } = classify(s);
    return {
      status: level === "CRITICAL" ? "circuit_breaker" : "ok",
      level,
      message,
      snapshot: {
        dailyPnLPct: s.dailyPnLPct,
        activePositions: s.activePositions,
        highWaterMarkPct: s.highWaterMarkPct,
      },
      evaluatedAt: new Date().toISOString(),
    };
  });

/**
 * GET /risk/evaluate — health check de risco sem sinal específico.
 * O Nest usa PositionRiskEngine com contexto sintético; portamos a decisão
 * final (approved + reasons) que é o que a UI consome, sem repetir o motor
 * completo (fica na Fase 3, junto com execução).
 */
export const evaluateRisk = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RiskEvaluateDTO> => {
    const s = await loadSnapshot(context.supabase as never, context.userId);
    const { level, message } = classify(s);
    const approved = level !== "CRITICAL";
    return {
      approved,
      level,
      reasons: approved ? [] : [message],
      snapshot: {
        dailyPnLPct: s.dailyPnLPct,
        activePositions: s.activePositions,
        highWaterMarkPct: s.highWaterMarkPct,
        totalBalance: s.totalBalance,
        dailyPnL: s.dailyPnL,
      },
      evaluatedAt: new Date().toISOString(),
    };
  });
