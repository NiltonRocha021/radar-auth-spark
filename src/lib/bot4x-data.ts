export type ExecMode = "DEMO" | "REAL";
export type Side = "LONG" | "SHORT";
export type CalibProfile = "conservador" | "rsi" | "aiscore" | "agressivo";

export type ProfileSpec = {
  id: CalibProfile;
  name: string;
  color: string;
  desc: string;
  rsiBuy: number;
  rsiSell: number;
  aiScore: number;
  fomo: number;
  wr: number;
  riskRank: 1 | 2 | 3 | 4;
  levMatrix: Record<number, "ok" | "warn" | "no">;
};

export const PROFILES: Record<CalibProfile, ProfileSpec> = {
  conservador: {
    id: "conservador", name: "Conservador", color: "#1D9E75",
    desc: "Máxima qualidade. Aceita poucos sinais, prioriza taxa de acerto.",
    rsiBuy: 35, rsiSell: 65, aiScore: 85, fomo: 15, wr: 62, riskRank: 1,
    levMatrix: { 1: "ok", 2: "ok", 3: "ok", 4: "warn", 5: "warn", 6: "warn", 7: "warn", 8: "no", 9: "no", 10: "no" },
  },
  rsi: {
    id: "rsi", name: "Calibrado RSI", color: "#378ADD",
    desc: "Relaxa RSI mantendo aiScore alto. Mais entradas com risco controlado.",
    rsiBuy: 40, rsiSell: 60, aiScore: 85, fomo: 15, wr: 59, riskRank: 2,
    levMatrix: { 1: "ok", 2: "ok", 3: "ok", 4: "ok", 5: "warn", 6: "warn", 7: "warn", 8: "warn", 9: "no", 10: "no" },
  },
  aiscore: {
    id: "aiscore", name: "Calibrado aiScore", color: "#7F77DD",
    desc: "Relaxa aiScore mantendo RSI estrito. Aceita confiança IA mais baixa.",
    rsiBuy: 35, rsiSell: 65, aiScore: 78, fomo: 15, wr: 57, riskRank: 3,
    levMatrix: { 1: "ok", 2: "ok", 3: "ok", 4: "ok", 5: "warn", 6: "warn", 7: "warn", 8: "warn", 9: "no", 10: "no" },
  },
  agressivo: {
    id: "agressivo", name: "Agressivo", color: "#E24B4A",
    desc: "Máximo volume de sinais. Aceita FOMO mais alto. Use com cautela.",
    rsiBuy: 40, rsiSell: 60, aiScore: 78, fomo: 20, wr: 53, riskRank: 4,
    levMatrix: { 1: "ok", 2: "ok", 3: "warn", 4: "warn", 5: "warn", 6: "warn", 7: "no", 8: "no", 9: "no", 10: "no" },
  },
};

export function leverageRisk(lev: number): { tier: "low" | "med" | "high"; label: string; color: string; diagnosis: string } {
  if (lev <= 3) return { tier: "low", label: "🟢 RISCO BAIXO", color: "#1D9E75", diagnosis: "Volatilidade absorvida. Boa zona para acumulação de WR." };
  if (lev <= 7) return { tier: "med", label: "🟡 RISCO MÉDIO", color: "#EF9F27", diagnosis: "Alavancagem operacional. Requer disciplina de stop." };
  return { tier: "high", label: "🔴 RISCO ALTO", color: "#E24B4A", diagnosis: "Liquidação próxima. Apenas com perfil Conservador + filtros máximos." };
}

export function slTpFromLeverage(lev: number) {
  const sl = (0.005 / lev) * 100;
  const tp = (0.010 / lev) * 100;
  return { sl: sl.toFixed(3), tp: tp.toFixed(3) };
}

export type Order = {
  id: string;
  pair: string;
  side: Side;
  entry: number;
  sl: number;
  tp: number;
  openedAt: number;
  pnlPct: number;
};

export type FilterKey = "F1" | "F2" | "F3" | "F4" | "F5" | "F6";
export const FILTER_NAMES: Record<FilterKey, string> = {
  F1: "Spread", F2: "Liquidez", F3: "RSI", F4: "aiScore", F5: "FOMO", F6: "Volatilidade",
};

export type Tick = {
  id: string;
  ts: number;
  pair: string;
  side: Side;
  filters: Record<FilterKey, boolean>;
  blockedAt?: FilterKey;
  verdict: "EXECUTE" | "BLOCKED";
  json: Record<string, unknown>;
};

export type Trade = {
  id: string;
  day: string;
  pair: string;
  side: Side;
  entry: number;
  stop: number;
  target: number;
  result: "WIN" | "LOSS" | "BLOCKED" | "SHUTDOWN";
  pnl: number;
  pnlPct: number;
  accumulated: number;
  profile: CalibProfile;
  leverage: number;
  motivo: string;
  hour: number;
};

const PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ARB/USDT", "AVAX/USDT", "LINK/USDT"];
const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]) => a[rand(a.length)];

export function makeTick(): Tick {
  const pair = pick(PAIRS);
  const side: Side = Math.random() > 0.5 ? "LONG" : "SHORT";
  const filters: Record<FilterKey, boolean> = { F1: true, F2: true, F3: true, F4: true, F5: true, F6: true };
  let blockedAt: FilterKey | undefined;
  const order: FilterKey[] = ["F1", "F2", "F3", "F4", "F5", "F6"];
  for (const k of order) {
    if (Math.random() < 0.18) {
      filters[k] = false;
      blockedAt = k;
      break;
    }
  }
  const verdict = blockedAt ? "BLOCKED" : "EXECUTE";
  return {
    id: `tk_${Date.now()}_${rand(9999)}`,
    ts: Date.now(),
    pair, side, filters, blockedAt, verdict,
    json: {
      pair, side,
      rsi: +(20 + Math.random() * 60).toFixed(1),
      aiScore: +(60 + Math.random() * 40).toFixed(1),
      fomo: +(Math.random() * 30).toFixed(1),
      spread: +(0.01 + Math.random() * 0.08).toFixed(3),
      verdict, blockedAt: blockedAt ?? null,
    },
  };
}

export function genHistory(n = 80): Trade[] {
  const out: Trade[] = [];
  let acc = 1000;
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - rand(30));
    const pair = pick(PAIRS);
    const side: Side = Math.random() > 0.5 ? "LONG" : "SHORT";
    const r = Math.random();
    let result: Trade["result"];
    if (r < 0.55) result = "WIN";
    else if (r < 0.85) result = "LOSS";
    else if (r < 0.96) result = "BLOCKED";
    else result = "SHUTDOWN";
    const entry = +(100 + Math.random() * 40000).toFixed(2);
    const stop = +(entry * (side === "LONG" ? 0.995 : 1.005)).toFixed(2);
    const target = +(entry * (side === "LONG" ? 1.010 : 0.990)).toFixed(2);
    const pnlPct = result === "WIN" ? +(0.3 + Math.random() * 0.7).toFixed(2)
      : result === "LOSS" ? -+(0.3 + Math.random() * 0.5).toFixed(2) : 0;
    const pnl = +(acc * (pnlPct / 100)).toFixed(2);
    acc = +(acc + pnl).toFixed(2);
    const profile = pick<CalibProfile>(["conservador", "rsi", "aiscore", "agressivo"]);
    const leverage = 1 + rand(10);
    const motivo = result === "WIN" ? "TP atingido"
      : result === "LOSS" ? "SL atingido"
      : result === "BLOCKED" ? `Bloqueado em F${1 + rand(6)}`
      : "Circuit breaker -1.5%";
    out.push({
      id: `tr_${i}`,
      day: d.toISOString().slice(0, 10),
      pair, side, entry, stop, target, result, pnl, pnlPct,
      accumulated: acc, profile, leverage, motivo,
      hour: rand(24),
    });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

export function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
