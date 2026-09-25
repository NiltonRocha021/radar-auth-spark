// Server functions para dados públicos de mercado (CoinGecko + Fear & Greed).
// Cache compartilhado via Cloudflare `caches.default` — ver `src/lib/cache.ts`.
// Sem credencial obrigatória: funciona com plano Demo gratuito da CoinGecko.
// Cache compartilhado entre TODOS os usuários no mesmo PoP, reduzindo
// drasticamente as chamadas externas.
import { createServerFn } from "@tanstack/react-start";
import { cachedJson } from "./cache";

const COIN_IDS = [
  "bitcoin",
  "ethereum",
  "tether",
  "binancecoin",
  "solana",
  "usd-coin",
  "ripple",
  "cardano",
  "avalanche-2",
  "dogecoin",
  "shiba-inu",
  "chainlink",
  "polkadot",
  "polygon",
  "bitcoin-cash",
  "near",
  "litecoin",
  "uniswap",
  "toncoin",
  "staked-ether",
].join(",");

const SYMBOL_MAP: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  tether: "USDT",
  binancecoin: "BNB",
  solana: "SOL",
  "usd-coin": "USDC",
  ripple: "XRP",
  cardano: "ADA",
  "avalanche-2": "AVAX",
  dogecoin: "DOGE",
  "shiba-inu": "SHIB",
  chainlink: "LINK",
  polkadot: "DOT",
  polygon: "MATIC",
  "bitcoin-cash": "BCH",
  near: "NEAR",
  litecoin: "LTC",
  uniswap: "UNI",
  toncoin: "TON",
  "staked-ether": "STETH",
};

// Símbolos sem par USDT direto na Binance — ignorados no fallback.
const NO_BINANCE_PAIR = new Set(["USDT", "USDC", "STETH"]);

export interface CoinPriceDTO {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number | null;
  volume24h: number;
  high24h: number;
  low24h: number;
}

export interface GlobalMetricsDTO {
  totalMarketCap: number;
  totalVolume: number;
  btcDominance: number;
  marketCapChange24h: number;
}

export interface FearGreedDTO {
  value: number;
  label: string;
}

export interface MarketSnapshotDTO {
  prices: Record<string, CoinPriceDTO>;
  global: GlobalMetricsDTO | null;
  fearGreed: FearGreedDTO | null;
  fetchedAt: number;
  /** Horário em que os preços foram efetivamente obtidos da fonte. */
  dataAsOf: number;
  /** Indica que a resposta reutilizou o último snapshot conhecido. */
  stale: boolean;
  /** true quando todos os preços vieram do fallback Binance (CoinGecko indisponível). */
  usingFallback?: boolean;
}

// TTLs com mínimo seguro para evitar 429 da CoinGecko free/demo tier.
// 60s é o piso recomendado pelo plano free (30 req/min).
const PRICES_TTL = Math.max(60, Number(process.env.CACHE_TTL_PRICES_SECONDS ?? 60));
const SENTIMENT_TTL = Number(process.env.CACHE_TTL_SENTIMENT_SECONDS ?? 60);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** fetch com timeout explícito — evita travar o Worker indefinidamente. */
async function fetchWithTimeout(url: string, timeoutMs = 8_000, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Monta os headers da CoinGecko.
 * - Se COINGECKO_API_KEY estiver definida (Pro/Demo), usa x-cg-pro-api-key.
 * - Sem chave: ainda funciona no plano Demo gratuito com x-cg-demo-api-key
 *   (obtida em https://www.coingecko.com/en/api — cadastro gratuito).
 *   Sem nenhuma chave o endpoint /coins/markets retorna 403 desde 2024-Q4.
 */
function coinGeckoHeaders(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY;
  if (!key) {
    // Sem chave configurada: tenta sem header — vai cair no fallback Binance
    // se retornar 403. Para resolver definitivamente, obtenha uma chave Demo
    // gratuita em coingecko.com e adicione COINGECKO_API_KEY no .dev.vars.
    return {};
  }
  // Chave Pro usa x-cg-pro-api-key; chave Demo usa x-cg-demo-api-key.
  // A CoinGecko aceita ambos os headers — usar pro-api-key é mais seguro
  // pois funciona para qualquer plano pago ou demo.
  return { "x-cg-pro-api-key": key };
}

// ---------------------------------------------------------------------------
// Binance — fallback quando CoinGecko falha ou retorna 403/429
// ---------------------------------------------------------------------------

const BINANCE_HOSTS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://data-api.binance.vision",
];

async function fetchFromBinance(symbols: string[]): Promise<Record<string, CoinPriceDTO>> {
  const pairs = symbols.filter((s) => !NO_BINANCE_PAIR.has(s)).map((s) => `${s}USDT`);

  if (pairs.length === 0) return {};

  const symbolsParam = JSON.stringify(pairs);
  let lastErr: unknown = null;

  for (const host of BINANCE_HOSTS) {
    try {
      const url = `${host}/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`;
      const res = await fetchWithTimeout(url, 6_000);

      if (res.status === 429 || res.status === 418) {
        console.warn(`[market] Binance ${host} rate-limited (${res.status}), tentando próximo host`);
        lastErr = new Error(`Binance rate limit: ${res.status}`);
        continue;
      }
      if (!res.ok) {
        lastErr = new Error(`Binance ${host} HTTP ${res.status}`);
        continue;
      }

      const arr = (await res.json()) as Array<Record<string, string>>;
      const result: Record<string, CoinPriceDTO> = {};
      for (const t of arr) {
        const sym = String(t.symbol).replace(/USDT$/, "");
        result[sym] = {
          id: sym.toLowerCase(),
          symbol: sym,
          name: sym,
          price: Number(t.lastPrice ?? 0),
          change24h: Number(t.priceChangePercent ?? 0),
          marketCap: null,
          volume24h: Number(t.quoteVolume ?? 0),
          high24h: Number(t.highPrice ?? 0),
          low24h: Number(t.lowPrice ?? 0),
        };
      }
      return result;
    } catch (e) {
      lastErr = e;
    }
  }

  console.warn("[market] Todos os hosts Binance falharam:", lastErr);
  return {};
}

// ---------------------------------------------------------------------------
// CoinPaprika — segunda fonte para métricas globais (sem chave necessária)
// ---------------------------------------------------------------------------

async function fetchGlobalFromCoinPaprika(): Promise<GlobalMetricsDTO | null> {
  try {
    const res = await fetchWithTimeout("https://api.coinpaprika.com/v1/global", 5_000);
    if (!res.ok) {
      console.warn(`[market] CoinPaprika global HTTP ${res.status}`);
      return null;
    }
    const g = (await res.json()) as Record<string, number>;
    return {
      totalMarketCap: Number(g.market_cap_usd ?? 0),
      totalVolume: Number(g.volume_24h_usd ?? 0),
      btcDominance: Number(g.bitcoin_dominance_percentage ?? 0),
      marketCapChange24h: Number(g.market_cap_change_24h ?? 0),
    };
  } catch (e) {
    console.warn("[market] CoinPaprika global falhou:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// CoinGecko + fallback Binance + CoinPaprika
// ---------------------------------------------------------------------------

// Snapshot em memória do último resultado bem-sucedido (por isolate).
// Garante que, se todas as fontes ao vivo falharem num refresh, o cliente
// ainda recebe o último snapshot conhecido em vez de um objeto vazio.
let lastGoodSnapshot: { prices: Record<string, CoinPriceDTO>; global: GlobalMetricsDTO | null; at: number } | null = null;

// Statuses que devem acionar fallback imediato para a Binance.
const COINGECKO_FALLBACK_STATUSES = new Set([401, 403, 429, 500, 502, 503]);

async function loadPricesAndGlobal(): Promise<{
  prices: Record<string, CoinPriceDTO>;
  global: GlobalMetricsDTO | null;
  usingFallback: boolean;
  dataAsOf: number;
  stale: boolean;
}> {
  const headers = coinGeckoHeaders();

  const [coinsRes, globalRes] = await Promise.allSettled([
    fetchWithTimeout(
      `https://api.coingecko.com/api/v3/coins/markets` +
        `?vs_currency=usd&ids=${COIN_IDS}` +
        `&order=market_cap_desc&per_page=20&sparkline=false` +
        `&price_change_percentage=24h`,
      8_000,
      { headers },
    ),
    fetchWithTimeout("https://api.coingecko.com/api/v3/global", 6_000, { headers }),
  ]);

  const prices: Record<string, CoinPriceDTO> = {};

  // --- CoinGecko: preços ---
  if (coinsRes.status === "fulfilled") {
    const res = coinsRes.value;
    if (res.ok) {
      const data = (await res.json()) as Array<Record<string, unknown>>;
      for (const c of data) {
        const id = String(c.id);
        const sym = SYMBOL_MAP[id] ?? String(c.symbol ?? "").toUpperCase();
        prices[sym] = {
          id,
          symbol: sym,
          name: String(c.name ?? ""),
          price: Number(c.current_price ?? 0),
          change24h: Number(c.price_change_percentage_24h ?? 0),
          marketCap: Number(c.market_cap ?? 0),
          volume24h: Number(c.total_volume ?? 0),
          high24h: Number(c.high_24h ?? 0),
          low24h: Number(c.low_24h ?? 0),
        };
      }
    } else {
      const retryAfter = res.headers.get("Retry-After");
      const hint =
        res.status === 403
          ? " Obtenha uma chave Demo gratuita em coingecko.com e defina COINGECKO_API_KEY no .dev.vars."
          : res.status === 429
            ? ` Retry-After: ${retryAfter ?? "?"}s. Aumente CACHE_TTL_PRICES_SECONDS (atual: ${PRICES_TTL}s).`
            : "";
      console.warn(`[market] CoinGecko coins HTTP ${res.status}.${hint}`);
    }
  } else {
    console.warn("[market] CoinGecko coins falhou (rede):", coinsRes.reason);
  }

  // --- CoinGecko: métricas globais ---
  let global: GlobalMetricsDTO | null = null;
  if (globalRes.status === "fulfilled" && globalRes.value.ok) {
    const g = ((await globalRes.value.json()) as { data?: Record<string, unknown> }).data ?? {};
    global = {
      totalMarketCap: (g.total_market_cap as Record<string, number> | undefined)?.usd ?? 0,
      totalVolume: (g.total_volume as Record<string, number> | undefined)?.usd ?? 0,
      btcDominance: (g.market_cap_percentage as Record<string, number> | undefined)?.btc ?? 0,
      marketCapChange24h: Number(g.market_cap_change_percentage_24h_usd ?? 0),
    };
  } else if (globalRes.status === "fulfilled") {
    console.warn(`[market] CoinGecko global HTTP ${globalRes.value.status}`);
  } else {
    console.warn("[market] CoinGecko global falhou (rede):", globalRes.reason);
  }

  // --- Fallback Binance ---
  // Aciona para qualquer símbolo que não veio da CoinGecko, incluindo
  // quando ela retorna 403 (sem chave) ou 429 (rate limit).
  const allSymbols = Object.values(SYMBOL_MAP);
  const missingSymbols = allSymbols.filter((s) => !prices[s]);
  const usingFallback = missingSymbols.length === allSymbols.length;

  if (missingSymbols.length > 0) {
    const binancePrices = await fetchFromBinance(missingSymbols);
    for (const [sym, data] of Object.entries(binancePrices)) {
      prices[sym] = data;
    }
    if (Object.keys(binancePrices).length > 0) {
      console.info(
        `[market] Binance preencheu ${Object.keys(binancePrices).length} símbolo(s): ` +
          Object.keys(binancePrices).join(", "),
      );
    }
  }

  // --- Fallback CoinPaprika para métricas globais ---
  if (!global) {
    global = await fetchGlobalFromCoinPaprika();
    if (global) {
      console.info("[market] CoinPaprika preencheu métricas globais (fallback)");
    }
  }

  // --- Stale snapshot: se tudo falhou, devolve último resultado conhecido ---
  if (Object.keys(prices).length === 0 && lastGoodSnapshot) {
    console.warn(
      `[market] todas as fontes falharam — usando snapshot stale de ${Math.round((Date.now() - lastGoodSnapshot.at) / 1000)}s atrás`,
    );
    return {
      prices: { ...lastGoodSnapshot.prices },
      global: global ?? lastGoodSnapshot.global,
      usingFallback: true,
      dataAsOf: lastGoodSnapshot.at,
      stale: true,
    };
  }

  // Persiste como último snapshot bom (se temos pelo menos preços)
  if (Object.keys(prices).length > 0) {
    lastGoodSnapshot = { prices, global, at: Date.now() };
  }

  return { prices, global, usingFallback, dataAsOf: Date.now(), stale: false };
}

// ---------------------------------------------------------------------------
// Fear & Greed Index
// ---------------------------------------------------------------------------

async function loadFearGreed(): Promise<FearGreedDTO | null> {
  try {
    const res = await fetchWithTimeout("https://api.alternative.me/fng/?limit=1", 5_000);
    if (!res.ok) {
      console.warn(`[market] Fear & Greed HTTP ${res.status}`);
      return null;
    }
    const fg = (
      (await res.json()) as {
        data?: Array<{ value: string; value_classification: string }>;
      }
    ).data?.[0];
    if (!fg) return null;
    return { value: parseInt(fg.value, 10), label: fg.value_classification };
  } catch (e) {
    console.warn("[market] Fear & Greed falhou:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Server function exportada
// ---------------------------------------------------------------------------

export const getMarketSnapshot = createServerFn({ method: "GET" }).handler(async (): Promise<MarketSnapshotDTO> => {
  const [pricesAndGlobal, fearGreed] = await Promise.all([
    cachedJson("market:prices+global", PRICES_TTL, loadPricesAndGlobal),
    cachedJson("market:feargreed", SENTIMENT_TTL, loadFearGreed),
  ]);
  return {
    prices: pricesAndGlobal.prices,
    global: pricesAndGlobal.global,
    fearGreed,
    fetchedAt: Date.now(),
    dataAsOf: pricesAndGlobal.dataAsOf,
    stale: pricesAndGlobal.stale,
    usingFallback: pricesAndGlobal.usingFallback,
  };
});
