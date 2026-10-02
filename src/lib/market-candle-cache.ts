import { fetchKlines, type Candle, type KlineInterval } from "./market-data";

type CacheEntry = {
  candles: Candle[];
  limit: number;
  loading?: Promise<Candle[]>;
};

type StreamState = {
  socket: WebSocket | null;
  symbols: Set<string>;
  stopped: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
};

const cache = new Map<string, CacheEntry>();
const streams = new Map<KlineInterval, StreamState>();

function key(symbol: string, interval: KlineInterval) {
  return `${symbol.toUpperCase()}:${interval}`;
}

function streamUrl(interval: KlineInterval, symbols: string[]) {
  const streams = symbols
    .map((s) => `${s.toLowerCase()}@kline_${interval}`)
    .join("/");
  return `wss://stream.binance.com:9443/stream?streams=${streams}`;
}

function upsertCandle(symbol: string, interval: KlineInterval, candle: Candle) {
  const k = key(symbol, interval);
  const entry = cache.get(k);
  if (!entry) {
    cache.set(k, { candles: [candle], limit: 300 });
    return;
  }

  const last = entry.candles.at(-1);
  if (!last || candle.openTime > last.openTime) {
    entry.candles = [...entry.candles, candle].slice(-entry.limit);
  } else if (candle.openTime === last.openTime) {
    entry.candles = [...entry.candles.slice(0, -1), candle];
  }
}

function connectStream(interval: KlineInterval) {
  const state = streams.get(interval);
  if (!state || state.stopped || state.symbols.size === 0 || typeof WebSocket === "undefined") return;

  state.socket?.close();
  state.socket = new WebSocket(streamUrl(interval, [...state.symbols]));

  state.socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as {
        data?: {
          s?: string;
          k?: {
            t?: number;
            T?: number;
            o?: string;
            h?: string;
            l?: string;
            c?: string;
            v?: string;
          };
        };
      };
      const symbol = payload.data?.s;
      const k = payload.data?.k;
      if (!symbol || !k) return;

      const candle: Candle = {
        openTime: Number(k.t),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
        volume: Number(k.v),
        closeTime: Number(k.T),
      };

      if (
        Number.isFinite(candle.openTime) &&
        Number.isFinite(candle.close) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low)
      ) {
        upsertCandle(symbol, interval, candle);
      }
    } catch {
      // Uma mensagem inválida não deve derrubar o feed.
    }
  };

  state.socket.onclose = () => {
    state.socket = null;
    if (!state.stopped && state.reconnectTimer === null) {
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null;
        connectStream(interval);
      }, 2000);
    }
  };

  state.socket.onerror = () => state.socket?.close();
}

export function startMarketCandleCache(
  symbols: string[],
  interval: KlineInterval,
) {
  if (typeof WebSocket === "undefined") return;

  let state = streams.get(interval);
  if (!state) {
    state = { socket: null, symbols: new Set(), stopped: false, reconnectTimer: null };
    streams.set(interval, state);
  }

  state.stopped = false;
  const normalized = symbols.map((s) => s.replace("/", "").toUpperCase());
  const before = [...state.symbols];
  normalized.forEach((s) => state!.symbols.add(s));

  if (state.symbols.size && (before.length !== state.symbols.size || !state.socket)) {
    connectStream(interval);
  }
}

export async function getMarketCandles(
  symbol: string,
  interval: KlineInterval,
  limit: number,
): Promise<Candle[]> {
  const normalized = symbol.replace("/", "").toUpperCase();
  const k = key(normalized, interval);
  const wanted = Math.max(30, Math.min(1000, limit));
  const existing = cache.get(k);

  if (existing && existing.candles.length >= Math.min(wanted, 30)) {
    existing.limit = Math.max(existing.limit, wanted);
    return existing.candles.slice(-wanted);
  }

  if (existing?.loading) {
    const candles = await existing.loading;
    return candles.slice(-wanted);
  }

  const loading = fetchKlines(normalized, interval, wanted).then((candles) => {
    cache.set(k, { candles: candles.slice(-wanted), limit: wanted });
    startMarketCandleCache([normalized], interval);
    return candles;
  });

  cache.set(k, { candles: existing?.candles ?? [], limit: wanted, loading });

  try {
    const candles = await loading;
    return candles.slice(-wanted);
  } finally {
    const current = cache.get(k);
    if (current?.loading === loading) delete current.loading;
  }
}

export function stopMarketCandleCache() {
  for (const state of streams.values()) {
    state.stopped = true;
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    state.socket?.close();
    state.socket = null;
  }
  streams.clear();
  cache.clear();
}
