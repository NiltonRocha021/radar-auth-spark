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
} as const;

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
};
