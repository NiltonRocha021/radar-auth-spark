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

function generateMockSimulation(req: BackendSimulationRequest): BackendSimulationResponse {
  // Geração determinística baseada nos parâmetros, sem aleatoriedade.
  const seed = (req.profile + req.symbol + req.period_days).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = (i: number) => {
    const x = Math.sin(seed + i) * 10000;
    return x - Math.floor(x);
  };
  const profileBias: Record<SimulationProfile, number> = {
    conservador: 0.55,
    rsi: 0.52,
    aiscore: 0.58,
    agressivo: 0.48,
  };
  const profileVol: Record<SimulationProfile, number> = {
    conservador: 0.004,
    rsi: 0.008,
    aiscore: 0.006,
    agressivo: 0.018,
  };
  const days = Math.max(1, Math.min(365, req.period_days));
  const points = Math.min(180, Math.max(20, days * 4));
  const balance = req.initial_balance ?? 10000;
  const winBias = profileBias[req.profile];
  const vol = profileVol[req.profile];
  let equity = balance;
  let peak = balance;
  let maxDd = 0;
  const equity_curve: BackendSimulationPoint[] = [];
  let wins = 0;
  let losses = 0;
  const now = Date.now();
  for (let i = 0; i < points; i++) {
    const r = rand(i);
    const win = r < winBias;
    const move = vol * (0.5 + rand(i + 1000));
    equity = equity * (1 + (win ? move : -move));
    if (win) wins++; else losses++;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDd) maxDd = dd;
    const t = new Date(now - (points - i) * (days * 86400000) / points).toISOString();
    equity_curve.push({ t, equity: Number(equity.toFixed(2)) });
  }
  const trades = wins + losses;
  const pnl = equity - balance;
  const pnl_pct = (pnl / balance) * 100;
  const win_rate = trades ? wins / trades : 0;
  const sharpe = Number(((pnl_pct / 100) / (Math.max(vol, 0.001) * Math.sqrt(points))).toFixed(2));
  return {
    trades,
    wins,
    losses,
    win_rate: Number(win_rate.toFixed(4)),
    pnl: Number(pnl.toFixed(2)),
    pnl_pct: Number(pnl_pct.toFixed(2)),
    max_drawdown: Number(maxDd.toFixed(4)),
    sharpe,
    equity_curve,
    dna_feedback: {
      pattern_detected: "backend indisponível — usando simulação determinística local",
      correction: "Configure VITE_API_BASE_URL apontando para o BCE para resultados reais",
      expected_improvement: "—",
    },
    commentary: `mock(${req.profile}/${req.symbol}/${days}d)`,
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
  async simulate(userId: string, req: BackendSimulationRequest): Promise<SimulationResultUI> {
    try {
      const data = await api.post<BackendSimulationResponse>(
        calibratorEndpoints.simulate(userId),
        req,
      );
      return mapSimulationResult(data);
    } catch (e: any) {
      // Fallback determinístico quando o BCE não está acessível (preview/local sem backend).
      // Não substitui o backend: apenas evita travar a UI quando a rede falha.
      const isNetwork =
        !e?.response ||
        e?.code === "ERR_NETWORK" ||
        e?.message === "Network Error";
      if (!isNetwork) throw e;
      const mock = generateMockSimulation(req);
      return { ...mapSimulationResult(mock), commentary: `[offline mock] ${mock.commentary ?? ""}`.trim() };
    }
  },
};
