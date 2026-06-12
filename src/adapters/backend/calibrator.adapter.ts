// Adaptador para o Bot4x Calibration Engine (BCE).
// Mapeia o JSON canônico do Calibrador para o consumo no frontend.
// NÃO substitui o store local — apenas expõe os dados do backend.
import { api } from "./api.adapter";

export type CalibratorState =
  | "OPTIMAL"
  | "WARNING"
  | "RISK_DRIFT"
  | "PROTECTION"
  | "SHUTDOWN";

export type CalibratorTradeAllowance = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";

export interface BackendCalibratorPayload {
  state: CalibratorState;
  risk_multiplier: number;
  trade_allowance: CalibratorTradeAllowance;
  behavioral_flags?: string[];
  actions?: string[];
  dna_feedback?: {
    pattern_detected?: string;
    correction?: string;
    expected_improvement?: string;
  };
  commentary?: string;
  // Mapeamento para o perfil local do tab-calibrador (opcional)
  profile?: "conservador" | "rsi" | "aiscore" | "agressivo";
  updatedAt?: string;
}

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
  profile?: BackendCalibratorPayload["profile"];
  updatedAt?: string;
  raw?: BackendCalibratorPayload;
}

export function mapCalibratorState(p: BackendCalibratorPayload): CalibratorStateUI {
  return {
    state: p.state,
    riskMultiplier: p.risk_multiplier,
    tradeAllowance: p.trade_allowance,
    behavioralFlags: p.behavioral_flags ?? [],
    actions: p.actions ?? [],
    dnaFeedback: {
      patternDetected: p.dna_feedback?.pattern_detected ?? "",
      correction: p.dna_feedback?.correction ?? "",
      expectedImprovement: p.dna_feedback?.expected_improvement ?? "",
    },
    commentary: p.commentary ?? "",
    profile: p.profile,
    updatedAt: p.updatedAt,
    raw: p,
  };
}

export const calibratorEndpoints = {
  state: (userId: string) => `/calibrator/state/${userId}`,
  feedback: (userId: string) => `/calibrator/feedback/${userId}`,
  simulate: (userId: string) => `/calibrator/simulate/${userId}`,
} as const;

export type SimulationProfile = "conservador" | "rsi" | "aiscore" | "agressivo";

export interface BackendSimulationRequest {
  profile: SimulationProfile;
  symbol: string;
  period_days: number;
  initial_balance?: number;
  /** Alavancagem aplicada por trade (1× a 125×). */
  leverage?: number;
  /** ISO date (YYYY-MM-DD) — fim da janela do backtest (inclusivo). */
  end_date?: string;
  /** ISO date (YYYY-MM-DD) — início da janela do backtest. */
  start_date?: string;
}

export interface BackendSimulationPoint {
  t: string;
  equity: number;
}

export interface BackendSimulationResponse {
  trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  pnl: number;
  pnl_pct: number;
  max_drawdown: number;
  sharpe?: number;
  equity_curve: BackendSimulationPoint[];
  dna_feedback?: BackendCalibratorPayload["dna_feedback"];
  commentary?: string;
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
  raw?: BackendSimulationResponse;
}

export function mapSimulationResult(r: BackendSimulationResponse): SimulationResultUI {
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
    raw: r,
  };
}

export const calibratorAdapter = {
  async getState(userId: string): Promise<CalibratorStateUI | null> {
    const data = await api.get<BackendCalibratorPayload | null>(
      calibratorEndpoints.state(userId),
    );
    return data ? mapCalibratorState(data) : null;
  },
  async sendFeedback(userId: string, payload: Record<string, unknown>) {
    return api.post(calibratorEndpoints.feedback(userId), payload);
  },
  /**
   * Executa backtest. Tenta o BCE primeiro; se indisponível, usa dados reais
   * da Binance e roda o motor de backtest local com alavancagem.
   */
  async simulate(userId: string, req: BackendSimulationRequest): Promise<SimulationResultUI> {
    try {
      const data = await api.post<BackendSimulationResponse>(
        calibratorEndpoints.simulate(userId),
        req,
      );
      return mapSimulationResult(data);
    } catch (e: any) {
      const isNetwork =
        !e?.response ||
        e?.code === "ERR_NETWORK" ||
        e?.message === "Network Error";
      if (!isNetwork) throw e;
      // Fallback com dados REAIS da Binance (sem backend BCE).
      const { fetchKlines, planFetch } = await import("@/lib/market-data");
      const { runBacktest } = await import("@/lib/calibrator-backtest");
      const plan = planFetch(req.period_days);
      const candles = await fetchKlines(req.symbol, plan.interval, plan.limit);
      const result = runBacktest({
        profile: req.profile,
        symbol: req.symbol,
        candles,
        initialBalance: req.initial_balance ?? 10000,
        leverage: req.leverage ?? 1,
      });
      return mapSimulationResult(result);
    }
  },
};
