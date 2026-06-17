// Bot4x — Signal scoring logic for the 4 analytical engines.
// SCALPER (M5) · INTRADAY (H1) · SWING (H4) · POSITION (D1)
// Pure functions — no API calls. Consume OHLCV cache already populated.

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Volatility = "LOW" | "MEDIUM" | "HIGH";
export type Trend = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface MarketRegime {
  trend: Trend;
}

export interface MarketSnapshot {
  price: number;
  triggerPrice: number;
  manipulationScore: number;
  volatility: Volatility;
  rsi: number;
  aiScore: number;
  fearGreedIndex: number;
  btcDominance?: number;
  fundingRate?: number;
  btcCandles?: OHLCV[];
}

export type Zone = "TOP" | "MIDDLE" | "BOTTOM";
export type Direction = "BUY" | "SELL" | "HOLD";

// ===== Global helpers =====

export function calcChannelZone(candles: OHLCV[], currentPrice: number): Zone {
  const last20 = candles.slice(-20);
  const pivotHigh = Math.max(...last20.map((c) => c.high));
  const pivotLow = Math.min(...last20.map((c) => c.low));
  const position = (currentPrice - pivotLow) / (pivotHigh - pivotLow);
  if (position >= 0.75) return "TOP";
  if (position <= 0.3) return "BOTTOM";
  return "MIDDLE";
}

export function calcVolumeRatio(candles: OHLCV[]): number {
  const last20Vols = candles.slice(-20).map((c) => c.volume);
  const avgVol = last20Vols.reduce((a, b) => a + b, 0) / last20Vols.length;
  const currentVol = candles[candles.length - 1].volume;
  return currentVol / avgVol - 1;
  // > 0.5  → high volume (+15)
  // 0–0.5  → neutral     (+0)
  // < 0    → below avg   (-10)
}

// ===== Engine 1 — SCALPER (M5) =====

export function calcScalperScore(snapshot: MarketSnapshot, candles: OHLCV[]): number {
  let score = 50;

  if (snapshot.manipulationScore >= 60) return 0; // hard block

  if (snapshot.volatility === "HIGH") score += 15;
  if (snapshot.volatility === "MEDIUM") score += 5;
  if (snapshot.volatility === "LOW") score -= 10;

  const zone = calcChannelZone(candles, snapshot.price);
  if (zone === "BOTTOM") score += 20;
  if (zone === "TOP") score += 20;
  if (zone === "MIDDLE") score -= 10;

  if (snapshot.aiScore >= 75) score += 15;
  else if (snapshot.aiScore >= 60) score += 8;
  else score -= 10;

  const vr = calcVolumeRatio(candles);
  if (vr > 0.5) score += 15;
  else if (vr < 0) score -= 10;

  const drift = Math.abs((snapshot.price - snapshot.triggerPrice) / snapshot.triggerPrice);
  if (drift > 0.02) return 0; // anti-FOMO block

  return Math.max(0, Math.min(100, score));
}

export function scalperSignal(snapshot: MarketSnapshot, candles: OHLCV[]): Direction {
  const score = calcScalperScore(snapshot, candles);
  const zone = calcChannelZone(candles, snapshot.price);
  if (zone === "BOTTOM" && score >= 70) return "BUY";
  if (zone === "TOP" && score >= 70) return "SELL";
  return "HOLD";
}

export const SCALPER_RISK = { slPct: 0.5, tpPct: 1.0, rr: 2.0, expiryMin: 20 };

// ===== Engine 2 — INTRADAY (H1) =====

export function calcIntradayScore(
  snapshot: MarketSnapshot,
  candles: OHLCV[],
  regime: MarketRegime,
): number {
  let score = 50;

  const rsi = snapshot.rsi;
  if (regime.trend === "BULLISH" && rsi < 40) score += 20;
  if (regime.trend === "BEARISH" && rsi > 65) score += 20;
  if (rsi >= 40 && rsi <= 60) score -= 10;

  const dom = snapshot.btcDominance ?? 50;
  if (dom < 40) score -= 15;
  if (dom > 60) score += 8;

  if (snapshot.volatility === "HIGH") score += 10;
  if (snapshot.volatility === "LOW") score -= 15;

  const manip = snapshot.manipulationScore;
  if (manip >= 75) score -= 25;
  else if (manip >= 50) score -= 10;

  const zone = calcChannelZone(candles, snapshot.price);
  if (snapshot.aiScore >= 75 && zone !== "MIDDLE") score += 15;

  const fg = snapshot.fearGreedIndex;
  if (fg <= 25) score += 10;
  if (fg >= 80) score -= 10;

  return Math.max(0, Math.min(100, score));
}

export const INTRADAY_RISK = { slPct: 1.5, tpPct: 3.2, rr: 2.1, expiryHours: 3 };

// ===== Engine 3 — SWING (H4) =====

export function calcADX(candles: OHLCV[], period = 14): number {
  if (candles.length < period + 1) return 20;
  let plusDM = 0,
    minusDM = 0,
    tr = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const h = candles[i].high,
      l = candles[i].low;
    const ph = candles[i - 1].high,
      pl = candles[i - 1].low,
      pc = candles[i - 1].close;
    plusDM += Math.max(h - ph, 0);
    minusDM += Math.max(pl - l, 0);
    tr += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  const pDI = (plusDM / tr) * 100;
  const mDI = (minusDM / tr) * 100;
  return Math.round((Math.abs(pDI - mDI) / (pDI + mDI + 0.001)) * 100);
}

export function calcFibProximity(
  candles: OHLCV[],
  price: number,
): "ON_FIB" | "NEAR_FIB" | "OFF_FIB" {
  const last50 = candles.slice(-50);
  const swingH = Math.max(...last50.map((c) => c.high));
  const swingL = Math.min(...last50.map((c) => c.low));
  const range = swingH - swingL;
  const fibs = [0.382, 0.5, 0.618].map((f) => swingL + range * f);
  const nearest = Math.min(...fibs.map((f) => Math.abs(price - f) / price));
  if (nearest < 0.005) return "ON_FIB";
  if (nearest < 0.01) return "NEAR_FIB";
  return "OFF_FIB";
}

export function calcSwingScore(snapshot: MarketSnapshot, candles: OHLCV[]): number {
  let score = 50;

  const adx = calcADX(candles, 14);
  if (adx >= 25 && adx <= 40) score += 20;
  if (adx > 40) score -= 10;
  if (adx < 25) score -= 15;

  const fr = snapshot.fundingRate ?? 0;
  if (fr > 0.001) score -= 20;
  if (fr < -0.001) score += 10;

  const fib = calcFibProximity(candles, snapshot.price);
  if (fib === "ON_FIB") score += 20;
  if (fib === "NEAR_FIB") score += 10;

  const manip = snapshot.manipulationScore;
  if (manip >= 80) score -= 20;
  else if (manip >= 65) score -= 10;
  else if (manip >= 50) score -= 5;

  if (snapshot.aiScore >= 70) score += 15;
  if (snapshot.aiScore < 45) score -= 10;

  const fg = snapshot.fearGreedIndex;
  if (fg <= 25) score += 15;
  if (fg >= 75) score -= 10;

  return Math.max(0, Math.min(100, score));
}

export const SWING_RISK = { slPct: 3.0, tpPct: 7.0, rr: 2.3, expiryHours: 24 };

// ===== Engine 4 — POSITION (D1) =====

export function calcEMA(candles: OHLCV[], period: number): number {
  if (candles.length < period) return candles[candles.length - 1].close;
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) ema = candles[i].close * k + ema * (1 - k);
  return ema;
}

export function calcBTCCorrelation(candles: OHLCV[], btcCandles: OHLCV[]): number {
  const n = Math.min(30, candles.length - 1, btcCandles.length - 1);
  if (n < 10) return 0.5;
  const r = Array.from(
    { length: n },
    (_, i) => (candles[i + 1].close - candles[i].close) / candles[i].close,
  );
  const br = Array.from(
    { length: n },
    (_, i) => (btcCandles[i + 1].close - btcCandles[i].close) / btcCandles[i].close,
  );
  const mr = r.reduce((a, b) => a + b, 0) / n;
  const mbr = br.reduce((a, b) => a + b, 0) / n;
  const num = r.reduce((s, v, i) => s + (v - mr) * (br[i] - mbr), 0);
  const den = Math.sqrt(
    r.reduce((s, v) => s + (v - mr) ** 2, 0) * br.reduce((s, v) => s + (v - mbr) ** 2, 0),
  );
  return den === 0 ? 0 : Math.round((num / den) * 100) / 100;
}

export function detectWyckoff(
  candles: OHLCV[],
): "ACCUMULATION" | "DISTRIBUTION" | "UNKNOWN" {
  const last5 = candles.slice(-5);
  const avgVol = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
  const highVol = last5.every((c) => c.volume > avgVol * 1.3);
  const lateral = last5.every((c) => Math.abs((c.close - c.open) / c.open) < 0.015);
  const priorClose = candles[candles.length - 10].close;
  const afterRally = candles[candles.length - 1].close > priorClose * 1.1;
  if (highVol && lateral && !afterRally) return "ACCUMULATION";
  if (highVol && lateral && afterRally) return "DISTRIBUTION";
  return "UNKNOWN";
}

export function calcPositionScore(
  snapshot: MarketSnapshot,
  candles: OHLCV[],
  regime: MarketRegime,
): number {
  let score = 50;

  const fg = snapshot.fearGreedIndex;
  if (fg <= 25) score += regime.trend === "BEARISH" ? 15 : 30;
  if (fg > 25 && fg <= 40) score += 15;
  if (fg >= 75) score -= 20;
  if (fg >= 60 && fg < 75) score -= 5;

  const corr = calcBTCCorrelation(candles, snapshot.btcCandles ?? []);
  if (corr >= 0.8) score += 10;
  if (corr < 0.6 && regime.trend === "BEARISH") score -= 25;

  const wyckoff = detectWyckoff(candles);
  if (wyckoff === "ACCUMULATION") score += 15;
  if (wyckoff === "DISTRIBUTION") score -= 10;

  if (snapshot.manipulationScore >= 80) score -= 15;

  if (snapshot.aiScore >= 75) score += 15;
  if (snapshot.aiScore < 40) score -= 15;

  const ema200 = calcEMA(candles, 200);
  if (snapshot.price < ema200) score -= 10;
  if (snapshot.price > ema200 * 1.02) score += 10;

  return Math.max(0, Math.min(100, score));
}

export const POSITION_RISK = { slPct: 6.0, tpPct: 15.0, rr: 2.5, expiryDays: 7 };

// ===== Mock snapshot (BTC) =====

export const mockBTCSnapshot: MarketSnapshot = {
  price: 105420,
  triggerPrice: 105200,
  manipulationScore: 42,
  volatility: "LOW",
  rsi: 64,
  aiScore: 72,
  fearGreedIndex: 45,
  btcDominance: 54.2,
  fundingRate: 0.00045,
  btcCandles: [],
};

// Sample reasoning strings (reference only):
//  "ADX 31 — strong trend"
//  "Fib 61.8% at 104,200 — pullback level"
//  "BTC correlation 0.87"
//  "Wyckoff: ACCUMULATION"
//  "EMA200 below price — bullish"
