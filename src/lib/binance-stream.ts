// Stream público de tickers da Binance (WebSocket, sem credenciais).
//
// Alimenta `usePriceStore.setLivePrice()` tick a tick, tornando as cotações
// do topo do dashboard realmente em tempo real. O polling de 30s
// (`getMarketSnapshot`) continua existindo como base e como fonte de
// market cap / métricas globais — este stream apenas sobrescreve preço,
// variação 24h, volume, máxima e mínima.
//
// Somente browser: nunca importar em server functions.

import { usePriceStore } from "@/hooks/useLivePrices";

/** Símbolos com par USDT na Binance (alinhado ao SYMBOL_MAP de market.functions). */
export const STREAM_SYMBOLS = [
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "XRP",
  "ADA",
  "AVAX",
  "DOGE",
  "SHIB",
  "LINK",
  "DOT",
  "BCH",
  "NEAR",
  "LTC",
  "UNI",
  "TON",
] as const;

const WS_BASE = "wss://stream.binance.com:9443/stream?streams=";

type TickerPayload = {
  s: string; // símbolo (ex.: BTCUSDT)
  c: string; // último preço
  P: string; // variação percentual 24h
  q: string; // volume em quote (USDT) 24h
  h: string; // máxima 24h
  l: string; // mínima 24h
};

export type StreamStatus = "connecting" | "open" | "closed";

let socket: WebSocket | null = null;
let refCount = 0;
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(status: StreamStatus) => void>();
let status: StreamStatus = "closed";

function setStatus(next: StreamStatus) {
  if (status === next) return;
  status = next;
  for (const l of listeners) l(next);
}

function backoffDelay(n: number): number {
  const base = Math.min(30_000, 1_000 * 2 ** n);
  return base / 2 + Math.random() * (base / 2); // jitter
}

function applyTicker(t: TickerPayload) {
  const symbol = String(t.s ?? "").replace(/USDT$/, "");
  const price = Number(t.c);
  if (!symbol || !Number.isFinite(price) || price <= 0) return;

  usePriceStore.getState().setLivePrice(symbol, {
    price,
    change24h: Number(t.P) || 0,
    volume24h: Number(t.q) || 0,
    high24h: Number(t.h) || 0,
    low24h: Number(t.l) || 0,
    lastUpdated: new Date(),
  });
}

function connect() {
  if (typeof window === "undefined" || socket) return;

  const streams = STREAM_SYMBOLS.map((s) => `${s.toLowerCase()}usdt@ticker`).join("/");
  setStatus("connecting");

  let ws: WebSocket;
  try {
    ws = new WebSocket(WS_BASE + streams);
  } catch (e) {
    console.warn("[binance-stream] falha ao abrir WebSocket:", e);
    scheduleReconnect();
    return;
  }
  socket = ws;

  ws.onopen = () => {
    attempt = 0;
    setStatus("open");
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as { data?: TickerPayload };
      if (msg?.data?.s) applyTicker(msg.data);
    } catch {
      // Mensagem inesperada: ignora silenciosamente para não poluir o console.
    }
  };

  ws.onerror = () => {
    // O evento `close` sempre vem em seguida e cuida da reconexão.
  };

  ws.onclose = () => {
    socket = null;
    setStatus("closed");
    if (refCount > 0) scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer || refCount === 0) return;
  const delay = backoffDelay(attempt++);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

/**
 * Abre (ou reaproveita) a conexão do stream. Retorna a função de release —
 * o socket só fecha quando o último consumidor sai.
 */
export function acquireBinanceStream(onStatus?: (s: StreamStatus) => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (onStatus) {
    listeners.add(onStatus);
    onStatus(status);
  }
  refCount++;
  connect();

  return () => {
    if (onStatus) listeners.delete(onStatus);
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
      socket = null;
      setStatus("closed");
    }
  };
}
