import { useState, useEffect, useCallback, useRef } from "react";
import { getMarketSnapshot } from "@/lib/market.functions";

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
      // Chama server fn cacheada (caches.default no edge) — todos os
      // usuários no mesmo PoP compartilham o mesmo hit por ~5s (preços) /
      // ~60s (fear & greed), reduzindo carga sobre CoinGecko/alternative.me.
      const snap = await getMarketSnapshot();
      const now = new Date();
      const map: Record<string, CoinPrice> = {};
      for (const [sym, p] of Object.entries(snap.prices)) {
        map[sym] = { ...p, lastUpdated: now };
      }
      setPrices(map);
      setGlobal(snap.global);
      setFearGreed(snap.fearGreed);
      setError(null);
      setLastUpdate(now);
    } catch {
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
