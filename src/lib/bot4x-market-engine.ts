import type { Candle, KlineInterval } from "./market-data";
import { fetchKlines, TOP_20_USDT_PAIRS } from "./market-data";
import type { ProfileSpec, Tick, TickSide } from "./bot4x-data";

export type MarketSnapshot = {
  symbol: string;
  candles: Candle[];
  price: number;
  rsi: number;
  emaFast: number;
  emaSlow: number;
  atr: number;
  vwap: number;
  volumeRatio: number;
  momentumPct: number;
  liquidityGrab: boolean;
  fomoDisplacement: number;
  aiScore: number;
  channelZone: "BOTTOM" | "MIDDLE" | "TOP";
  side: TickSide;
};

const cache = new Map<string, { snapshot: MarketSnapshot; fetchedAt: number }>();
const CACHE_MS = 30_000;
const CANDLE_LIMIT = 120;

function sma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-Math.min(period, values.length));
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function ema(values: number[], period: number): number {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i++) result = values[i] * k + result * (1 - k);
  return result;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs = candles.slice(1).map((c, i) => {
    const prev = candles[i].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  });
  return sma(trs, period);
}

function vwap(candles: Candle[], period = 30): number {
  const slice = candles.slice(-period);
  let pv = 0;
  let volume = 0;
  for (const c of slice) {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    volume += c.volume;
  }
  return volume > 0 ? pv / volume : candles.at(-1)?.close ?? 0;
}

function liquidityGrab(candles: Candle[]): boolean {
  if (candles.length < 21) return false;
  const last = candles.at(-1)!;
  const prior = candles.slice(-21, -1);
  const priorHigh = Math.max(...prior.map((c) => c.high));
  const priorLow = Math.min(...prior.map((c) => c.low));
  const swept = last.high > priorHigh || last.low < priorLow;
  const rejectedHigh = last.high > priorHigh && last.close < priorHigh;
  const rejectedLow = last.low < priorLow && last.close > priorLow;
  return swept && (rejectedHigh || rejectedLow);
}

function scoreMarket(args: {
  rsi: number;
  emaFast: number;
  emaSlow: number;
  price: number;
  vwap: number;
  volumeRatio: number;
  momentumPct: number;
  liquidityGrab: boolean;
}): number {
  let score = 50;
  const trend = args.emaFast > args.emaSlow ? 1 : -1;
  const momentum = args.momentumPct >= 0 ? 1 : -1;

  score += trend * 10;
  score += momentum * 8;
  score += args.liquidityGrab ? 12 : 0;
  score += args.volumeRatio >= 1.2 ? 8 : args.volumeRatio >= 1 ? 4 : -4;
  score += Math.abs(args.price - args.vwap) / Math.max(args.price, 1) < 0.01 ? 6 : -3;

  if (args.rsi <= 35 || args.rsi >= 65) score += 6;
  else if (args.rsi >= 45 && args.rsi <= 55) score -= 4;

  return Math.max(0, Math.min(100, +score.toFixed(1)));
}

export async function fetchMarketSnapshot(
  symbol: string,
  interval: KlineInterval = "1h",
): Promise<MarketSnapshot> {
  const key = symbol + ":" + interval;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.snapshot;

  const candles = await fetchKlines(symbol, interval, CANDLE_LIMIT);
  if (candles.length < 30) throw new Error("Dados insuficientes para análise de " + symbol);

  const closes = candles.map((c) => c.close);
  const price = closes.at(-1)!;
  const previous = closes.at(-2)!;
  const emaFast = ema(closes, 9);
  const emaSlow = ema(closes, 21);
  const currentRsi = rsi(closes, 14);
  const currentAtr = atr(candles, 14);
  const currentVwap = vwap(candles, 30);
  const avgVolume = sma(candles.slice(0, -1).map((c) => c.volume), 20);
  const volumeRatio = avgVolume > 0 ? candles.at(-1)!.volume / avgVolume : 1;
  const momentumPct = ((price - closes[Math.max(0, closes.length - 6)]) / closes[Math.max(0, closes.length - 6)]) * 100;
  const grab = liquidityGrab(candles);
  const score = scoreMarket({
    rsi: currentRsi,
    emaFast,
    emaSlow,
    price,
    vwap: currentVwap,
    volumeRatio,
    momentumPct,
    liquidityGrab: grab,
  });

  const channelWidth = Math.max(currentAtr * 1.5, price * 0.005);
  const channelCenter = currentVwap;
  const channelZone =
    price <= channelCenter - channelWidth
      ? "BOTTOM"
      : price >= channelCenter + channelWidth
        ? "TOP"
        : "MIDDLE";

  const side: TickSide = channelZone === "BOTTOM" ? "BUY" : channelZone === "TOP" ? "SELL" : null;
  const fomoDisplacement = Math.abs(momentumPct);

  const snapshot: MarketSnapshot = {
    symbol,
    candles,
    price,
    rsi: +currentRsi.toFixed(2),
    emaFast,
    emaSlow,
    atr: currentAtr,
    vwap: currentVwap,
    volumeRatio: +volumeRatio.toFixed(2),
    momentumPct: +momentumPct.toFixed(3),
    liquidityGrab: grab,
    aiScore: score,
    channelZone,
    side,
    fomoDisplacement: +fomoDisplacement.toFixed(2),
  };
  cache.set(key, { snapshot, fetchedAt: Date.now() });
  return snapshot;
}

export async function fetchDemoMarketTick(
  profile: ProfileSpec,
  slotsUsed: number,
  busyPairs: string[],
  shutdown: boolean,
): Promise<Tick> {
  const candidates = TOP_20_USDT_PAIRS.filter((p) => !busyPairs.includes(p.symbol.replace("USDT", "/USDT")));
  const symbols = candidates.length ? candidates : TOP_20_USDT_PAIRS;
  const ordered = [...symbols].sort(() => 0); // deterministic copy; no random market data

  let selected: MarketSnapshot | null = null;
  for (const item of ordered) {
    try {
      const snap = await fetchMarketSnapshot(item.symbol, "1h");
      if (!selected || snap.aiScore > selected.aiScore) selected = snap;
    } catch {
      // Continue to another Binance symbol when a public host is unavailable.
    }
  }
  if (!selected) throw new Error("Não foi possível obter dados reais da Binance para o DEMO.");

  const filters: Tick["filters"] = { F1: true, F2: true, F3: true, F4: true, F5: true, F6: true };
  const detail: Tick["detail"] = {
    F1: "Universo Binance Top 20 USDT",
    F2: `${slotsUsed}/10 slots`,
    F3: `Par ${selected.symbol.replace("USDT", "/USDT")} livre`,
    F4: `Zona ${selected.channelZone} · preço ${selected.price}`,
    F5: `RSI ${selected.rsi} · score ${selected.aiScore} · liqGrab ${selected.liquidityGrab ? "✓" : "✗"} · EMA9/21`,
    F6: `Mov. ${selected.fomoDisplacement}% (≤ ${profile.fomo}%)`,
  };

  let blockedAt: Tick["blockedAt"];
  let f5Sub: Tick["f5Sub"];
  let verdict: Tick["verdict"] = "EXECUTE";

  if (slotsUsed >= 10) {
    filters.F2 = false; blockedAt = "F2"; verdict = "GRID_SATURATED";
  } else if (busyPairs.includes(selected.symbol.replace("USDT", "/USDT"))) {
    filters.F3 = false; blockedAt = "F3"; verdict = "IGNORE";
  } else if (selected.channelZone === "MIDDLE") {
    filters.F4 = false; blockedAt = "F4"; verdict = "IGNORE";
  } else if (selected.side === "BUY" && selected.rsi >= profile.rsiBuy) {
    filters.F5 = false; blockedAt = "F5"; f5Sub = "RSI"; verdict = "IGNORE";
  } else if (selected.side === "SELL" && selected.rsi <= profile.rsiSell) {
    filters.F5 = false; blockedAt = "F5"; f5Sub = "RSI"; verdict = "IGNORE";
  } else if (selected.aiScore < profile.aiScore) {
    filters.F5 = false; blockedAt = "F5"; f5Sub = "AISCORE"; verdict = "IGNORE";
  } else if (!selected.liquidityGrab) {
    filters.F5 = false; blockedAt = "F5"; f5Sub = "LIQGRAB"; verdict = "IGNORE";
  } else if (selected.fomoDisplacement > profile.fomo) {
    filters.F6 = false; blockedAt = "F6"; verdict = "FOMO_BLOCKED";
  }

  if (shutdown) verdict = "EMERGENCY_SHUTDOWN";

  if (blockedAt) {
    const order: Tick["blockedAt"][] = ["F1", "F2", "F3", "F4", "F5", "F6"];
    const idx = order.indexOf(blockedAt);
    for (let i = idx + 1; i < order.length; i++) filters[order[i]!] = false;
  }

  return {
    id: `tk_${Date.now()}`,
    ts: Date.now(),
    pair: selected.symbol.replace("USDT", "/USDT"),
    side: selected.side,
    channelZone: selected.channelZone,
    rsi: selected.rsi,
    aiScore: selected.aiScore,
    liquidityGrab: selected.liquidityGrab,
    fomoDisplacement: selected.fomoDisplacement,
    profileId: profile.id,
    rsiBuy: profile.rsiBuy,
    rsiSell: profile.rsiSell,
    aiScoreMin: profile.aiScore,
    fomoLimit: profile.fomo,
    slotsUsed,
    filters,
    blockedAt,
    f5Sub,
    verdict,
    detail,
  };
}
