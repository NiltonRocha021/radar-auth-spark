// Fase 4 — Execução real na Binance a partir do Worker (sem NestJS).
// Server-only: assina requisições com HMAC-SHA256 via Web Crypto (compatível
// com o runtime Cloudflare Workers — não usa `crypto` do Node nem SDK Node-only).
//
// Env necessárias (secrets do projeto):
//   BINANCE_API_KEY, BINANCE_API_SECRET
//   BINANCE_BASE_URL (opcional; default = testnet)

const DEFAULT_BASE_URL = "https://testnet.binance.vision";

export interface BinanceFill {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  executedQty: number;
  avgPrice: number;
  status: string;
}

function readCreds() {
  const apiKey = process.env["BINANCE_API_KEY"];
  const apiSecret = process.env["BINANCE_API_SECRET"];
  const baseUrl = process.env["BINANCE_BASE_URL"] || DEFAULT_BASE_URL;
  if (!apiKey || !apiSecret) {
    throw new Error(
      "Execução LIVE indisponível: configure BINANCE_API_KEY e BINANCE_API_SECRET.",
    );
  }
  return { apiKey, apiSecret, baseUrl };
}

/** Indica se o modo LIVE está habilitado no ambiente atual. */
export function isLiveTradingConfigured(): boolean {
  return Boolean(process.env["BINANCE_API_KEY"] && process.env["BINANCE_API_SECRET"]);
}

async function sign(query: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(query));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signedRequest<T>(
  path: string,
  method: "GET" | "POST" | "DELETE",
  params: Record<string, string | number>,
): Promise<T> {
  const { apiKey, apiSecret, baseUrl } = readCreds();
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    timestamp: String(Date.now()),
    recvWindow: "5000",
  }).toString();
  const signature = await sign(query, apiSecret);

  const res = await fetch(`${baseUrl}${path}?${query}&signature=${signature}`, {
    method,
    headers: { "X-MBX-APIKEY": apiKey },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Binance ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

type BinanceOrderResponse = {
  orderId: number;
  symbol: string;
  side: "BUY" | "SELL";
  status: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  price: string;
  fills?: Array<{ price: string; qty: string }>;
};

function toFill(r: BinanceOrderResponse): BinanceFill {
  const executedQty = Number(r.executedQty) || 0;
  const quote = Number(r.cummulativeQuoteQty) || 0;
  let avgPrice = executedQty > 0 ? quote / executedQty : Number(r.price) || 0;
  if (!avgPrice && r.fills?.length) {
    const totalQty = r.fills.reduce((s, f) => s + Number(f.qty), 0);
    const totalQuote = r.fills.reduce((s, f) => s + Number(f.qty) * Number(f.price), 0);
    avgPrice = totalQty > 0 ? totalQuote / totalQty : 0;
  }
  return {
    orderId: String(r.orderId),
    symbol: r.symbol,
    side: r.side,
    executedQty,
    avgPrice,
    status: r.status,
  };
}

/** Envia uma ordem real (MARKET ou LIMIT) para a Binance. */
export async function placeBinanceOrder(input: {
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT";
  quantity: number;
  price?: number;
}): Promise<BinanceFill> {
  const params: Record<string, string | number> = {
    symbol: input.symbol,
    side: input.side,
    type: input.orderType,
    quantity: input.quantity,
  };
  if (input.orderType === "LIMIT") {
    if (!input.price) throw new Error("Ordem LIMIT exige preço");
    params["price"] = input.price;
    params["timeInForce"] = "GTC";
  }
  const res = await signedRequest<BinanceOrderResponse>("/api/v3/order", "POST", params);
  return toFill(res);
}

/** Fecha uma posição enviando a ordem MARKET oposta. */
export async function closeBinancePosition(input: {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
}): Promise<BinanceFill> {
  return placeBinanceOrder({
    symbol: input.symbol,
    side: input.side === "BUY" ? "SELL" : "BUY",
    orderType: "MARKET",
    quantity: input.quantity,
  });
}

/** Preço público de referência (sem assinatura). */
export async function fetchBinancePrice(symbol: string): Promise<number | null> {
  const baseUrl = process.env["BINANCE_BASE_URL"] || DEFAULT_BASE_URL;
  try {
    const res = await fetch(`${baseUrl}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { price?: string };
    const price = Number(json.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/** Conta autenticada — usado para validar credenciais/permissões. */
export async function fetchBinanceAccount(): Promise<{ canTrade: boolean }> {
  const res = await signedRequest<{ canTrade?: boolean }>("/api/v3/account", "GET", {});
  return { canTrade: Boolean(res.canTrade) };
}
