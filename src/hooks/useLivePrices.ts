// src/hooks/useLivePrices.ts
//
// Fonte única de verdade para preços via Zustand store.
// Polling via getMarketSnapshot a cada 30s como base;
// setLivePrice() disponível para stream Binance tick a tick.
//
// API pública INALTERADA — nenhum consumidor existente precisa mudar.

import { useState, useEffect, useCallback, useRef } from "react";
import { create } from "zustand";
import { getMarketSnapshot } from "@/lib/market.functions";
import { acquireBinanceStream, type StreamStatus } from "@/lib/binance-stream";


// ─── Tipos públicos ──────────────────────────────────────────────────────────

export interface CoinPrice {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number | null;
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

export type PartialPriceUpdate = Pick<
  CoinPrice,
  "price" | "change24h" | "volume24h" | "high24h" | "low24h" | "lastUpdated"
>;

// ─── Zustand store ───────────────────────────────────────────────────────────

interface PriceStoreState {
  prices: Record<string, CoinPrice>;
  global: GlobalMetrics | null;
  fearGreed: FearGreed | null;
  lastUpdate: Date | null;
  setPrices: (prices: Record<string, CoinPrice>, global: GlobalMetrics | null, fearGreed: FearGreed | null) => void;
  setLivePrice: (symbol: string, update: PartialPriceUpdate) => void;
}

export const usePriceStore = create<PriceStoreState>((set) => ({
  prices: {},
  global: null,
  fearGreed: null,
  lastUpdate: null,

  setPrices: (prices, global, fearGreed) => set({ prices, global, fearGreed, lastUpdate: new Date() }),

  setLivePrice: (symbol, update) =>
    set((state) => {
      const existing = state.prices[symbol];
      const base: CoinPrice = existing ?? {
        id: symbol.toLowerCase(),
        symbol,
        name: symbol,
        marketCap: null,
        price: 0,
        change24h: 0,
        volume24h: 0,
        high24h: 0,
        low24h: 0,
        lastUpdated: new Date(),
      };
      return {
        prices: { ...state.prices, [symbol]: { ...base, ...update } },
        lastUpdate: update.lastUpdated,
      };
    }),
}));

// ─── Hook público ─────────────────────────────────────────────────────────────

interface UseLivePricesReturn {
  prices: Record<string, CoinPrice>;
  global: GlobalMetrics | null;
  fearGreed: FearGreed | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  /** Estado do stream de tickers da Binance (tempo real). */
  streamStatus: StreamStatus;
  refresh: () => void;
}

const REFRESH_INTERVAL = 30_000;

// Janela em que um tick do stream é considerado mais confiável que o snapshot.
const STREAM_FRESH_MS = 20_000;

// Número mínimo de símbolos no store para considerar "dados válidos disponíveis".
const MIN_PRICES_FOR_LIVE = 5;

export function useLivePrices(): UseLivePricesReturn {
  const { prices, global, fearGreed, lastUpdate, setPrices } = usePriceStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("closed");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);


  const fetchAll = useCallback(async () => {
    try {
      const snap = await getMarketSnapshot();
      const now = new Date();
      const map: Record<string, CoinPrice> = {};

      for (const [sym, p] of Object.entries(snap.prices)) {
        const streamPrice = usePriceStore.getState().prices[sym];
        // O tick do WebSocket da Binance é sempre mais recente que o snapshot
        // de 30s — só é descartado quando ficou obsoleto (sem tick recente).
        const streamFresh =
          !!streamPrice && now.getTime() - streamPrice.lastUpdated.getTime() < STREAM_FRESH_MS;
        map[sym] = streamFresh
          ? { ...p, ...streamPrice, marketCap: p.marketCap, name: p.name }
          : { ...p, lastUpdated: now };
      }


      if (Object.keys(map).length > 0) {
        setPrices(
          map,
          snap.global
            ? {
                totalMarketCap: snap.global.totalMarketCap,
                totalVolume: snap.global.totalVolume,
                btcDominance: snap.global.btcDominance,
                marketCapChange24h: snap.global.marketCapChange24h,
              }
            : null,
          snap.fearGreed,
        );
      }

      // Limpa erro apenas quando os dados chegaram com sucesso.
      setError(null);
    } catch (err) {
      console.error("[useLivePrices] getMarketSnapshot falhou:", err);

      // Se o store já tem preços válidos (stream ou poll anterior),
      // não exibe badge de erro na UI — os dados exibidos são confiáveis.
      const currentPrices = usePriceStore.getState().prices;
      const hasFallbackData = Object.keys(currentPrices).length >= MIN_PRICES_FOR_LIVE;

      if (!hasFallbackData) {
        // Sem nenhum dado disponível — informa o usuário.
        setError("Falha ao buscar preços. Aguarde reconexão.");
      }
      // Com dados no store: mantém error=null (badge "API error" não aparece)
      // e os preços continuam exibidos normalmente.
    } finally {
      setLoading(false);
    }
  }, [setPrices]);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchAll]);

  // Stream tick a tick da Binance (WebSocket público, só no browser).
  useEffect(() => {
    const release = acquireBinanceStream(setStreamStatus);
    return release;
  }, []);

  return {
    prices,
    global,
    fearGreed,
    loading,
    error,
    lastUpdate,
    streamStatus,
    refresh: fetchAll,
  };
}

