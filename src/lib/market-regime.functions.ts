// Server function de leitura de regime de mercado.
// Porta MarketRegimeController.current do Nest (GET /market-regime/current?pair=).
//
// Estratégia (aprovada — caminho (a) na Fase 2): lógica de classificação
// determinística sobre market_ohlcv, SEM criar tabela nova nem depender de
// cache Redis. Se a performance de recalcular por leitura virar problema
// real, isso vira otimização de cache/materialized view na Fase 5 — não
// decisão agora.
//
// Fontes copiadas 1:1 do Nest (não simplificar):
//   - features.service.ts: calculateEMA / calculateATR / calculateRSI
//   - market-data.provider.ts: monta snapshot a partir de OHLCV
//   - regime-classifier.ts: classifica trend/volatility/regime/strength
//   - market-regime.service.ts: monta payload final + confidence + signals
//
// Symbol normalization: Nest recebe "BTC/USDT"; tabela guarda "BTCUSDT".
// Normalizamos removendo `/` e `-` (mesma regra usada em prices.functions.ts).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseRows, usableOhlcvSchema } from "@/lib/db-schemas";
import { TOP_20_USDT_PAIRS, fetchKlines, type KlineInterval } from "@/lib/market-data";

// ── Indicadores (cópia literal do FeaturesService do Nest) ────────────────
function calculateEMA(prices: number[], period: number): number {
  if (!prices.length || period <= 0 || prices.length < period) return 0;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number {
  if (period <= 0) return 0;
  if (highs.length !== lows.length || lows.length !== closes.length) return 0;
  if (closes.length <= period) return 0;
  let trSum = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    trSum += tr;
  }
  return trSum / period;
}

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const slice = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

// ── Classificador (cópia literal de RegimeClassifier do Nest) ─────────────
interface Snapshot {
  ema20: number;
  ema50: number;
  atr14: number;
  rsi: number;
}
interface ClassifyResult {
  regime: "RANGE" | "VOLATILE" | "TRENDING_BULL" | "TRENDING_BEAR";
  trend: "SIDEWAYS" | "BULLISH" | "BEARISH";
  volatility: "LOW" | "MODERATE" | "HIGH";
  strength: number;
}

function classify(s: Snapshot): ClassifyResult {
  const distance = s.ema20 === 0 ? 0 : Math.abs(s.ema20 - s.ema50) / s.ema20;
  const trend: ClassifyResult["trend"] =
    distance < 0.003 ? "SIDEWAYS" : s.ema20 > s.ema50 ? "BULLISH" : "BEARISH";
  const volatility: ClassifyResult["volatility"] =
    s.atr14 > s.ema20 * 0.05 ? "HIGH" : s.atr14 > s.ema20 * 0.02 ? "MODERATE" : "LOW";

  let regime: ClassifyResult["regime"] = "RANGE";
  if (trend === "SIDEWAYS") regime = "RANGE";
  else if (volatility === "HIGH") regime = "VOLATILE";
  else if (trend === "BULLISH") regime = "TRENDING_BULL";
  else regime = "TRENDING_BEAR";

  const strength =
    s.ema50 === 0
      ? 0
      : Math.round(Math.min((Math.abs(s.ema20 - s.ema50) / s.ema50) * 1000, 100));

  return { regime, trend, volatility, strength };
}

function calculateConfidence(s: Snapshot, r: ClassifyResult): number {
  let score = 0.55;
  const emaDistance = s.ema20 === 0 ? 0 : Math.abs(s.ema20 - s.ema50) / s.ema20;
  if (emaDistance > 0.01) score += 0.15;
  if (r.volatility === "HIGH") score += 0.1;
  if (r.trend !== "SIDEWAYS") score += 0.1;
  if (r.strength > 60) score += 0.1;
  return Math.min(score, 0.98);
}

function buildSignals(s: Snapshot, r: ClassifyResult): string[] {
  const signals: string[] = [];
  if (s.ema20 > s.ema50) signals.push("EMA20 above EMA50 (bullish bias)");
  else signals.push("EMA20 below EMA50 (bearish bias)");
  if (r.volatility === "HIGH") signals.push("High volatility detected");
  if (r.trend === "SIDEWAYS") signals.push("Market consolidation (range)");
  if (r.regime === "VOLATILE") signals.push("Regime: high risk environment");
  if (s.rsi < 30) signals.push("RSI oversold");
  if (s.rsi > 70) signals.push("RSI overbought");
  return signals;
}

// ── DTO ───────────────────────────────────────────────────────────────────
export interface MarketRegimeDTO {
  agent: "MARKET_REGIME";
  pair: string;
  regime: ClassifyResult["regime"] | "RANGE";
  trend: ClassifyResult["trend"];
  volatility: ClassifyResult["volatility"];
  strength: number;
  ema20: number;
  ema50: number;
  atr: number;
  rsi: number;
  confidence: number;
  score: number;
  signals: string[];
  updatedAt: string;
}

function defaultRegime(pair: string): MarketRegimeDTO {
  return {
    agent: "MARKET_REGIME",
    pair,
    regime: "RANGE",
    trend: "SIDEWAYS",
    volatility: "LOW",
    strength: 0,
    ema20: 0,
    ema50: 0,
    atr: 0,
    rsi: 50,
    confidence: 0,
    score: 0,
    signals: ["NO_DATA"],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSymbol(pair: string): string {
  return String(pair).toUpperCase().replace(/[-/]/g, "");
}

export const MARKET_REGIME_PAIRS = TOP_20_USDT_PAIRS.map((p) => ({
  symbol: p.symbol,
  pair: p.symbol.replace("USDT", "/USDT"),
  label: p.label,
}));

async function classifyFromBinance(pair: string, timeframe: KlineInterval): Promise<MarketRegimeDTO> {
  try {
    const candles = await fetchKlines(normalizeSymbol(pair), timeframe, 120);
    if (candles.length < 51) return defaultRegime(pair);
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const snapshot: Snapshot = {
      ema20: calculateEMA(closes, 20),
      ema50: calculateEMA(closes, 50),
      atr14: calculateATR(highs, lows, closes, 14),
      rsi: calculateRSI(closes, 14),
    };
    const result = classify(snapshot);
    const confidence = calculateConfidence(snapshot, result);
    const signals = buildSignals(snapshot, result);
    return {
      agent: "MARKET_REGIME",
      pair,
      regime: result.regime,
      trend: result.trend,
      volatility: result.volatility,
      strength: result.strength,
      ema20: snapshot.ema20,
      ema50: snapshot.ema50,
      atr: snapshot.atr14,
      rsi: snapshot.rsi,
      confidence,
      score: Math.round(confidence * 100),
      signals,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn("[market-regime.functions] Binance fallback failed:", pair, error);
    return defaultRegime(pair);
  }
}

export const getCurrentMarketRegimes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { timeframe?: string }) => ({
    timeframe: (input?.timeframe ?? "1h") as KlineInterval,
  }))
  .handler(async ({ data }): Promise<MarketRegimeDTO[]> => {
    const results = await Promise.all(
      MARKET_REGIME_PAIRS.map(({ pair }) => classifyFromBinance(pair, data.timeframe)),
    );
    return results;
  });

export const getCurrentMarketRegime = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { pair?: string; timeframe?: string }) => ({
    pair: input?.pair ?? "BTC/USDT",
    timeframe: input?.timeframe ?? "1h",
  }))
  .handler(async ({ data, context }): Promise<MarketRegimeDTO> => {
    const symbol = normalizeSymbol(data.pair);
    // 60 velas cobrem EMA50 + folga para ATR/RSI. Ordenamos desc, invertemos
    // no cliente para ficar cronológico (EMA precisa da ordem correta).
    const { data: rows, error } = await context.supabase
      .from("market_ohlcv")
      .select("open_time,high,low,close")
      .eq("symbol", symbol)
      .eq("timeframe", data.timeframe)
      .order("open_time", { ascending: false })
      .limit(120);
    if (error) {
      console.warn("[market-regime.functions] query error:", error.message);
      return defaultRegime(data.pair);
    }
    // Valida cada vela antes de calcular indicadores: velas incompletas ou
    // incoerentes (high < low, valores não numéricos) são descartadas — um
    // NaN aqui contaminaria EMA/ATR/RSI e o regime inteiro.
    const valid = parseRows(usableOhlcvSchema, rows, "market-regime.market_ohlcv");
    if (valid.length < 51) return defaultRegime(data.pair);

    const chronological = [...valid].reverse();
    const closes = chronological.map((r) => r.close as number);
    const highs = chronological.map((r) => r.high as number);
    const lows = chronological.map((r) => r.low as number);

    const snapshot: Snapshot = {
      ema20: calculateEMA(closes, 20),
      ema50: calculateEMA(closes, 50),
      atr14: calculateATR(highs, lows, closes, 14),
      rsi: calculateRSI(closes, 14),
    };

    const result = classify(snapshot);
    const confidence = calculateConfidence(snapshot, result);
    const score = Math.round(confidence * 100);
    const signals = buildSignals(snapshot, result);

    return {
      agent: "MARKET_REGIME",
      pair: data.pair,
      regime: result.regime,
      trend: result.trend,
      volatility: result.volatility,
      strength: result.strength,
      ema20: snapshot.ema20,
      ema50: snapshot.ema50,
      atr: snapshot.atr14,
      rsi: snapshot.rsi ?? 50,
      confidence,
      score,
      signals,
      updatedAt: new Date().toISOString(),
    };
  });
