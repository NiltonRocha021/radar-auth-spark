// Dados reais de mercado via Binance public API (klines).
// Sem autenticação. Usado pelo Calibrador para backtests reais.

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

/** Universo configurado de pares USDT usados pelo motor DEMO/Calibrador. A lista é estática. */
export const TOP_20_USDT_PAIRS: { symbol: string; label: string }[] = [
  { symbol: "BTCUSDT", label: "Bitcoin (BTC)" },
  { symbol: "ETHUSDT", label: "Ethereum (ETH)" },
  { symbol: "BNBUSDT", label: "BNB" },
  { symbol: "SOLUSDT", label: "Solana (SOL)" },
  { symbol: "XRPUSDT", label: "XRP" },
  { symbol: "ADAUSDT", label: "Cardano (ADA)" },
  { symbol: "DOGEUSDT", label: "Dogecoin (DOGE)" },
  { symbol: "TRXUSDT", label: "TRON (TRX)" },
  { symbol: "AVAXUSDT", label: "Avalanche (AVAX)" },
  { symbol: "LINKUSDT", label: "Chainlink (LINK)" },
  { symbol: "DOTUSDT", label: "Polkadot (DOT)" },
  { symbol: "POLUSDT", label: "Polygon (POL)" },
  { symbol: "TONUSDT", label: "Toncoin (TON)" },
  { symbol: "SHIBUSDT", label: "Shiba Inu (SHIB)" },
  { symbol: "LTCUSDT", label: "Litecoin (LTC)" },
  { symbol: "BCHUSDT", label: "Bitcoin Cash (BCH)" },
  { symbol: "UNIUSDT", label: "Uniswap (UNI)" },
  { symbol: "ATOMUSDT", label: "Cosmos (ATOM)" },
  { symbol: "XLMUSDT", label: "Stellar (XLM)" },
  { symbol: "NEARUSDT", label: "NEAR Protocol (NEAR)" },
];

const KLINE_CACHE_TTL_MS = 15_000;
const klineCache = new Map<string, { expiresAt: number; data: Candle[] }>();

const BINANCE_HOSTS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://data-api.binance.vision",
];

export type KlineInterval = "5m" | "15m" | "1h" | "4h" | "1d";

/** Busca klines reais da Binance, com fallback entre hosts. */
export async function fetchKlines(
  symbol: string,
  interval: KlineInterval,
  limit: number,
  opts?: { startTime?: number; endTime?: number },
): Promise<Candle[]> {
  const lim = Math.max(1, Math.min(1000, limit));
  const cacheKey = `${symbol}:${interval}:${lim}:${opts?.startTime ?? ""}:${opts?.endTime ?? ""}`;
  const cached = klineCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (cached) klineCache.delete(cacheKey);
  let lastErr: unknown = null;
  for (const host of BINANCE_HOSTS) {
    try {
      const qs = new URLSearchParams({
        symbol,
        interval,
        limit: String(lim),
      });
      if (opts?.startTime) qs.set("startTime", String(opts.startTime));
      if (opts?.endTime) qs.set("endTime", String(opts.endTime));
      const url = `${host}/api/v3/klines?${qs.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        lastErr = new Error(`Binance ${res.status}`);
        continue;
      }
      const raw = (await res.json()) as unknown[];
      if (!Array.isArray(raw)) continue;
      const candles = raw.map((row) => {
        const r = row as (string | number)[];
        return {
          openTime: Number(r[0]),
          open: Number(r[1]),
          high: Number(r[2]),
          low: Number(r[3]),
          close: Number(r[4]),
          volume: Number(r[5]),
          closeTime: Number(r[6]),
        };
      });
      klineCache.set(cacheKey, { expiresAt: Date.now() + KLINE_CACHE_TTL_MS, data: candles });
      return candles;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Falha ao obter dados de mercado para ${symbol}: ${(lastErr as Error)?.message ?? "rede indisponível"}`,
  );
}

/**
 * Busca o último preço (ticker) de vários símbolos na Binance, com fallback entre hosts.
 * Retorna um mapa `{ BTCUSDT: 65000, ... }`. Símbolos duplicados/vazios são ignorados.
 */
export async function fetchTickerPrices(symbols: string[]): Promise<Record<string, number>> {
  const unique = Array.from(new Set(symbols.filter(Boolean)));
  if (unique.length === 0) return {};
  const symbolsParam = JSON.stringify(unique);
  let lastErr: unknown = null;
  for (const host of BINANCE_HOSTS) {
    try {
      const res = await fetch(`${host}/api/v3/ticker/price?symbols=${encodeURIComponent(symbolsParam)}`);
      if (!res.ok) {
        lastErr = new Error(`Binance ${res.status}`);
        continue;
      }
      const raw = (await res.json()) as unknown;
      if (!Array.isArray(raw)) continue;
      const out: Record<string, number> = {};
      for (const item of raw as { symbol?: string; price?: string }[]) {
        const price = Number(item?.price);
        if (item?.symbol && Number.isFinite(price)) out[item.symbol] = price;
      }
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Falha ao obter preços de mercado: ${(lastErr as Error)?.message ?? "rede indisponível"}`,
  );
}

/** Escolhe o intervalo e a quantidade de candles para o período em dias. */
export function planFetch(periodDays: number): { interval: KlineInterval; limit: number } {
  if (periodDays <= 7) return { interval: "1h", limit: Math.min(1000, periodDays * 24) };
  if (periodDays <= 60) return { interval: "4h", limit: Math.min(1000, periodDays * 6) };
  return { interval: "1d", limit: Math.min(1000, periodDays) };
}
