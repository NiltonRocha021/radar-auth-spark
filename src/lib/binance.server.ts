// Fase 4 — Execução real na Binance a partir do Worker (sem NestJS).
// Server-only: assina requisições com HMAC-SHA256 via Web Crypto (compatível
// com o runtime Cloudflare Workers — não usa `crypto` do Node nem SDK Node-only).
//
import type { BinanceCredentials } from "./binance-credentials.server";

export interface BinanceFill {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  executedQty: number;
  avgPrice: number;
  status: string;
}

export interface BinanceBalance {
  asset: string;
  free: number;
  locked: number;
  valueUsdt: number;
}

export interface BinanceAccountSnapshot {
  canTrade: boolean;
  walletValueUsdt: number;
  availableValueUsdt: number;
  lockedValueUsdt: number;
  openOrderValueUsdt: number;
  balances: BinanceBalance[];
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
  credentials: BinanceCredentials,
  path: string,
  method: "GET" | "POST" | "DELETE",
  params: Record<string, string | number>,
  allowEmpty = false,
): Promise<T> {
  const { apiKey, apiSecret, baseUrl } = credentials;
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
    const detail = text.trim() || res.statusText || "resposta vazia";
    throw new Error(`Binance ${res.status}: ${detail.slice(0, 300)}`);
  }
  if (!text.trim()) {
    if (allowEmpty) return {} as T;
    throw new Error(`Binance ${res.status}: resposta vazia inesperada`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Binance ${res.status}: resposta inválida`);
  }
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
}, credentials: BinanceCredentials): Promise<BinanceFill> {
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
  const res = await signedRequest<BinanceOrderResponse>(credentials, "/api/v3/order", "POST", params);
  return toFill(res);
}

/** Valida assinatura, permissões e filtros sem criar uma ordem ou movimentar fundos. */
export async function validateBinanceOrder(input: {
  symbol: string;
  side: "BUY" | "SELL";
  quoteAmount: number;
}, credentials: BinanceCredentials): Promise<void> {
  await signedRequest<Record<string, never>>(credentials, "/api/v3/order/test", "POST", {
    symbol: input.symbol,
    side: input.side,
    type: "MARKET",
    ...(input.side === "BUY" ? { quoteOrderQty: input.quoteAmount } : { quantity: input.quoteAmount }),
  }, true);
}

/** Fecha uma posição enviando a ordem MARKET oposta. */
export async function closeBinancePosition(input: {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
}, credentials: BinanceCredentials): Promise<BinanceFill> {
  return placeBinanceOrder({
    symbol: input.symbol,
    side: input.side === "BUY" ? "SELL" : "BUY",
    orderType: "MARKET",
    quantity: input.quantity,
  }, credentials);
}

/** Preço público de referência (sem assinatura). */
export async function fetchBinancePrice(symbol: string, baseUrl = "https://api.binance.com"): Promise<number | null> {
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
export async function fetchBinanceAccount(credentials: BinanceCredentials): Promise<BinanceAccountSnapshot> {
  const [account, openOrders] = await Promise.all([
    signedRequest<{
      canTrade?: boolean;
      balances?: Array<{ asset?: string; free?: string; locked?: string }>;
    }>(credentials, "/api/v3/account", "GET", { omitZeroBalances: "true" }),
    signedRequest<Array<{ symbol?: string; price?: string; origQty?: string; executedQty?: string }>>(
      credentials,
      "/api/v3/openOrders",
      "GET",
      {},
    ),
  ]);

  const rawBalances = (account.balances ?? []).flatMap((row) => {
    const asset = row.asset?.trim().toUpperCase();
    const free = Number(row.free ?? 0);
    const locked = Number(row.locked ?? 0);
    return asset && Number.isFinite(free) && Number.isFinite(locked) && free + locked > 0
      ? [{ asset, free, locked }]
      : [];
  });
  const prices = await Promise.all(rawBalances.map(async ({ asset }) => {
    if (["USDT", "USDC", "FDUSD", "BUSD"].includes(asset)) return 1;
    return (await fetchBinancePrice(`${asset}USDT`, credentials.baseUrl)) ?? 0;
  }));
  const valuedBalances = rawBalances.map((balance, index) => ({
      ...balance,
      availableValueUsdt: balance.free * (prices[index] ?? 0),
      valueUsdt: (balance.free + balance.locked) * (prices[index] ?? 0),
    }));
  const availableValueUsdt = valuedBalances.reduce((sum, balance) => sum + balance.availableValueUsdt, 0);
  const balances = valuedBalances
    .filter((balance) => balance.valueUsdt > 0)
    .sort((a, b) => b.valueUsdt - a.valueUsdt)
    .map(({ asset, free, locked, valueUsdt }) => ({ asset, free, locked, valueUsdt }));

  const walletValueUsdt = balances.reduce((sum, balance) => sum + balance.valueUsdt, 0);
  const lockedValueUsdt = Math.max(walletValueUsdt - availableValueUsdt, 0);
  const openOrderValueUsdt = (openOrders ?? []).reduce((sum, order) => {
    const remaining = Math.max(Number(order.origQty ?? 0) - Number(order.executedQty ?? 0), 0);
    return sum + remaining * Number(order.price ?? 0);
  }, 0);

  return {
    canTrade: Boolean(account.canTrade),
    walletValueUsdt,
    availableValueUsdt,
    lockedValueUsdt,
    openOrderValueUsdt,
    balances: balances.slice(0, 12),
  };
}
