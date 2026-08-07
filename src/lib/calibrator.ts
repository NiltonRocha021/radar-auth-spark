// Motor de calibração/backtest — 100% local (Fase 5).
// Substitui `@/adapters/backend/calibrator.adapter`, que falava com o NestJS.
// Não há mais chamadas HTTP: as simulações rodam sobre candles da Binance
// via `market-data` + `calibrator-backtest`.
import { z } from "zod";

export type CalibratorState = "OPTIMAL" | "WARNING" | "RISK_DRIFT" | "PROTECTION" | "SHUTDOWN";

export type CalibratorTradeAllowance = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";

export type SimulationProfile =
  | "conservador"
  | "rsi"
  | "aiscore"
  | "agressivo"
  | "scalper"
  | "intraday"
  | "swing"
  | "position";

export interface CalibratorStateUI {
  state: CalibratorState;
  riskMultiplier: number;
  tradeAllowance: CalibratorTradeAllowance;
  behavioralFlags: string[];
  actions: string[];
  dnaFeedback: {
    patternDetected: string;
    correction: string;
    expectedImprovement: string;
  };
  commentary: string;
  profile?: SimulationProfile;
  updatedAt?: string;
}

export interface SimulationRequest {
  profile: SimulationProfile;
  symbol: string;
  period_days: number;
  initial_balance?: number;
  /** Alavancagem aplicada por trade (1× a 125×). */
  leverage?: number;
  /** ISO date (YYYY-MM-DD) — início da janela do backtest. */
  start_date?: string;
  /** ISO date (YYYY-MM-DD) — fim da janela do backtest (inclusivo). */
  end_date?: string;
}

export interface PairStatUI {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
}

export interface RiskSummaryUI {
  dayStops: number;
  dayTakes: number;
  haltedDays: number;
  liquidated: boolean;
}

export interface SimulationResultUI {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  pnl: number;
  pnlPct: number;
  maxDrawdown: number;
  sharpe: number;
  equityCurve: { t: string; equity: number }[];
  dnaFeedback: {
    patternDetected: string;
    correction: string;
    expectedImprovement: string;
  };
  commentary: string;
  byPair?: PairStatUI[];
  risk?: RiskSummaryUI;
}

// ─── Parsing defensivo ────────────────────────────────────────────────────────
// O backtest é local, mas os candles vêm de uma API externa: validamos a saída
// antes de entregar à UI para que um NaN/undefined nunca vire gráfico quebrado.
const num = (fallback = 0) =>
  z.coerce.number().refine(Number.isFinite, "valor numérico inválido").catch(fallback);

export const SimulationResultSchema = z
  .object({
    trades: num(),
    wins: num(),
    losses: num(),
    win_rate: num(),
    pnl: num(),
    pnl_pct: num(),
    max_drawdown: num(),
    sharpe: num().optional(),
    equity_curve: z
      .array(z.object({ t: z.string().catch(""), equity: num() }))
      .catch([]),
    dna_feedback: z
      .object({
        pattern_detected: z.string().optional(),
        correction: z.string().optional(),
        expected_improvement: z.string().optional(),
      })
      .partial()
      .optional(),
    commentary: z.string().optional(),
    by_pair: z
      .array(
        z.object({
          symbol: z.string(),
          trades: num(),
          wins: num(),
          losses: num(),
          pnl: num(),
        }),
      )
      .optional(),
    risk: z
      .object({
        dayStops: num(),
        dayTakes: num(),
        haltedDays: num(),
        liquidated: z.boolean().catch(false),
      })
      .optional(),
  })
  .passthrough();

export function mapSimulationResult(raw: unknown): SimulationResultUI {
  const parsed = SimulationResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Resultado da simulação em formato inesperado.");
  }
  const r = parsed.data;
  return {
    trades: r.trades,
    wins: r.wins,
    losses: r.losses,
    winRate: r.win_rate,
    pnl: r.pnl,
    pnlPct: r.pnl_pct,
    maxDrawdown: r.max_drawdown,
    sharpe: r.sharpe ?? 0,
    equityCurve: r.equity_curve ?? [],
    dnaFeedback: {
      patternDetected: r.dna_feedback?.pattern_detected ?? "",
      correction: r.dna_feedback?.correction ?? "",
      expectedImprovement: r.dna_feedback?.expected_improvement ?? "",
    },
    commentary: r.commentary ?? "",
    byPair: r.by_pair,
    risk: r.risk,
  };
}

function windowBounds(req: Pick<SimulationRequest, "start_date" | "end_date">) {
  const endTime = req.end_date ? Date.parse(`${req.end_date}T23:59:59Z`) : undefined;
  const startTime = req.start_date ? Date.parse(`${req.start_date}T00:00:00Z`) : undefined;
  return {
    startTime: Number.isFinite(startTime) ? startTime : undefined,
    endTime: Number.isFinite(endTime) ? endTime : undefined,
  };
}

export const calibrator = {
  /** Backtest de um único par. */
  async simulate(req: SimulationRequest): Promise<SimulationResultUI> {
    const { fetchKlines, planFetch } = await import("@/lib/market-data");
    const { runBacktest } = await import("@/lib/calibrator-backtest");
    const plan = planFetch(req.period_days);
    const candles = await fetchKlines(req.symbol, plan.interval, plan.limit, windowBounds(req));
    if (!candles.length) {
      throw new Error(`Sem candles disponíveis para ${req.symbol} no período selecionado.`);
    }
    return mapSimulationResult(
      runBacktest({
        profile: req.profile,
        symbol: req.symbol,
        candles,
        initialBalance: req.initial_balance ?? 10000,
        leverage: req.leverage ?? 1,
      }),
    );
  },

  /**
   * Portfolio backtest: roda N pares simultâneos com gestão de risco
   * unificada — máx 10 operações simultâneas, 10% do equity por slot,
   * SL/TP por trade e circuit breakers diários (-1.5% / +3%).
   */
  async simulatePortfolio(
    req: Omit<SimulationRequest, "symbol"> & { symbols: string[] },
  ): Promise<SimulationResultUI> {
    const { fetchKlines, planFetch } = await import("@/lib/market-data");
    const { runPortfolioBacktest } = await import("@/lib/calibrator-backtest");
    const plan = planFetch(req.period_days);
    const bounds = windowBounds(req);
    const symbols = await Promise.all(
      req.symbols.map(async (sym) => {
        try {
          const candles = await fetchKlines(sym, plan.interval, plan.limit, bounds);
          return { symbol: sym, candles };
        } catch {
          return { symbol: sym, candles: [] };
        }
      }),
    );
    const usable = symbols.filter((s) => s.candles.length > 0);
    if (!usable.length) {
      throw new Error("Nenhum par retornou candles para o período selecionado.");
    }
    return mapSimulationResult(
      runPortfolioBacktest({
        profile: req.profile,
        symbols: usable,
        initialBalance: req.initial_balance ?? 10000,
        leverage: req.leverage ?? 1,
      }),
    );
  },
};
