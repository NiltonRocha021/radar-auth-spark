import { useState, useEffect, useCallback, useRef } from "react";
import { getMarketSnapshot } from "@/lib/market.functions";

const SYMBOL_MAP: Record<string, string> = {
  bitcoin: "BTC", ethereum: "ETH", tether: "USDT",
  binancecoin: "BNB", solana: "SOL", "usd-coin": "USDC",
  ripple: "XRP", cardano: "ADA", "avalanche-2": "AVAX",
  dogecoin: "DOGE", "shiba-inu": "SHIB", chainlink: "LINK",
  polkadot: "DOT", polygon: "MATIC", "bitcoin-cash": "BCH",
  near: "NEAR", litecoin: "LTC", uniswap: "UNI",
  toncoin: "TON", "staked-ether": "STETH",
};

export interface CoinPrice {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  lastUpdated: Date;
}

export interface GlobalMetrics {
  totalMarketCap: number;
  totalVolume: number;
  btcDominance: number;
  marketCapChange24h: number;
}

export interface FearGreed {
  value: number;
  label: string;
}

interface UseLivePricesReturn {
  prices: Record<string, CoinPrice>;
  global: GlobalMetrics | null;
  fearGreed: FearGreed | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refresh: () => void;
}

const REFRESH_INTERVAL = 30_000; // 30 segundos

export function useLivePrices(): UseLivePricesReturn {
  const [prices, setPrices] = useState<Record<string, CoinPrice>>({});
  const [global, setGlobal] = useState<GlobalMetrics | null>(null);
  const [fearGreed, setFearGreed] = useState<FearGreed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [coinsRes, globalRes, fgRes] = await Promise.allSettled([
        fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COIN_IDS}&order=market_cap_desc&per_page=20&sparkline=false&price_change_percentage=24h`,
        ),
        fetch("https://api.coingecko.com/api/v3/global"),
        fetch("https://api.alternative.me/fng/?limit=1"),
      ]);

      // Preços
      if (coinsRes.status === "fulfilled" && coinsRes.value.ok) {
        const data = await coinsRes.value.json();
        const map: Record<string, CoinPrice> = {};
        data.forEach((c: any) => {
          const sym = SYMBOL_MAP[c.id] || c.symbol.toUpperCase();
          map[sym] = {
            id: c.id,
            symbol: sym,
            name: c.name,
            price: c.current_price ?? 0,
            change24h: c.price_change_percentage_24h ?? 0,
            marketCap: c.market_cap ?? 0,
            volume24h: c.total_volume ?? 0,
            high24h: c.high_24h ?? 0,
            low24h: c.low_24h ?? 0,
            lastUpdated: new Date(),
          };
        });
        setPrices(map);
      }

      // Global
      if (globalRes.status === "fulfilled" && globalRes.value.ok) {
        const g = (await globalRes.value.json()).data;
        setGlobal({
          totalMarketCap: g.total_market_cap?.usd ?? 0,
          totalVolume: g.total_volume?.usd ?? 0,
          btcDominance: g.market_cap_percentage?.btc ?? 0,
          marketCapChange24h: g.market_cap_change_percentage_24h_usd ?? 0,
        });
      }

      // Fear & Greed
      if (fgRes.status === "fulfilled" && fgRes.value.ok) {
        const fg = (await fgRes.value.json()).data?.[0];
        if (fg) {
          setFearGreed({
            value: parseInt(fg.value, 10),
            label: fg.value_classification,
          });
        }
      }

      setError(null);
      setLastUpdate(new Date());
    } catch (e) {
      setError("Falha ao buscar preços. Usando cache.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchAll]);

  return { prices, global, fearGreed, loading, error, lastUpdate, refresh: fetchAll };
}
