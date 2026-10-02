import { TOP_20_USDT_PAIRS } from "./market-data";

type PriceMap = Record<string, number>;
type Listener = (prices: PriceMap) => void;

let socket: WebSocket | null = null;
let symbols: string[] = [];
let prices: PriceMap = {};
const listeners = new Set<Listener>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

function streamsFor(list: string[]) {
  return list.map((symbol) => symbol.toLowerCase() + "@ticker").join("/");
}

function connect() {
  if (stopped || typeof WebSocket === "undefined" || symbols.length === 0) return;
  socket?.close();
  socket = new WebSocket("wss://stream.binance.com:9443/stream?streams=" + streamsFor(symbols));

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as { data?: { s?: string; c?: string } };
      const symbol = payload.data?.s;
      const price = Number(payload.data?.c);
      if (!symbol || !Number.isFinite(price)) return;
      prices = { ...prices, [symbol]: price };
      for (const listener of listeners) listener(prices);
    } catch {
      // Ignora mensagens inválidas sem derrubar o feed.
    }
  };

  socket.onclose = () => {
    socket = null;
    if (!stopped && reconnectTimer === null) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 2000);
    }
  };

  socket.onerror = () => socket?.close();
}

export function startDemoMarketFeed(extraSymbols: string[] = []) {
  const next = [...TOP_20_USDT_PAIRS.map((p) => p.symbol), ...extraSymbols]
    .map((s) => s.replace("/", "").toUpperCase())
    .filter((s, i, a) => a.indexOf(s) === i);

  stopped = false;
  if (next.join(",") !== symbols.join(",")) {
    symbols = next;
    connect();
  } else if (!socket) {
    connect();
  }
}

export function subscribeDemoMarketFeed(listener: Listener) {
  listeners.add(listener);
  if (Object.keys(prices).length) listener(prices);
  return () => listeners.delete(listener);
}

export function getDemoMarketPrices() {
  return prices;
}

export function stopDemoMarketFeed() {
  stopped = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  socket?.close();
  socket = null;
  symbols = [];
  prices = {};
  listeners.clear();
}
