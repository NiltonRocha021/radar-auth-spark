// src/hooks/useLivePrices.ts
//
// CORREÇÕES neste arquivo:
// 1. Extrai um Zustand store (usePriceStore) como fonte única de verdade para preços.
//    Antes havia dois hooks independentes (useLivePrices + usePrices) que podiam
//    divergir. Agora qualquer fonte (CoinGecko, Binance stream, REST backend)
//    escreve no mesmo store — e qualquer consumidor lê do mesmo lugar.
//
// 2. setLivePrice() é exposta para o useBinancePriceStream gravar preços
//    tick a tick sem quebrar a API pública (usePrice/useLivePrices inalterados).
//
// 3. Polling via getMarketSnapshot mantido a cada 30s como fonte de fallback
//    e para campos que o Binance stream não entrega (marketCap, name, id).
//
// API pública INALTERADA — nenhum consumidor existente precisa mudar.

import { useState, useEffect, useCallback, useRef } from "react";
import { create } from "zustand";
import { getMarketSnapshot } from "@/lib/market.functions";

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

// Subset de CoinPrice que fontes parciais (Binance stream) podem atualizar.
// Campos opcionais não sobrescrevem valores anteriores vindos do CoinGecko.
export type PartialPriceUpdate = Pick<
  CoinPrice,
  "price" | "change24h" | "volume24h" | "high24h" | "low24h" | "lastUpdated"
>;

// ─── Zustand store (fonte única de verdade) ──────────────────────────────────

interface PriceStoreState {
  prices: Record<string, CoinPrice>;
  global: GlobalMetrics | null;
  fearGreed: FearGreed | null;
  lastUpdate: Date | null;

  /** Substitui o mapa inteiro (chamado pelo polling CoinGecko/Binance REST). */
  setPrices: (prices: Record<string, CoinPrice>, global: GlobalMetrics | null, fearGreed: FearGreed | null) => void;

  /**
   * Atualiza campos de preço de UM símbolo sem sobrescrever metadados
   * (id, name, marketCap) que só chegam via CoinGecko.
   * Chamado pelo useBinancePriceStream a cada tick (~1s).
   */
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
      // Se o símbolo ainda não existe no store (CoinGecko não chegou ainda),
      // cria um registro mínimo para não perder o dado do stream.
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
        prices: {
          ...state.prices,
          [symbol]: { ...base, ...update },
        },
        lastUpdate: update.lastUpdated,
      };
    }),
}));

// ─── Hook público (API inalterada) ───────────────────────────────────────────

interface UseLivePricesReturn {
  prices: Record<string, CoinPrice>;
  global: GlobalMetrics | null;
  fearGreed: FearGreed | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refresh: () => void;
}

const REFRESH_INTERVAL = 30_000; // 30 segundos — complementa o stream tick a tick

export function useLivePrices(): UseLivePricesReturn {
  const { prices, global, fearGreed, lastUpdate, setPrices } = usePriceStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const snap = await getMarketSnapshot();
      const now = new Date();
      const map: Record<string, CoinPrice> = {};
      for (const [sym, p] of Object.entries(snap.prices)) {
        // Mescla com dado do stream se existir (preserva price mais recente do stream)
        const streamPrice = usePriceStore.getState().prices[sym];
        map[sym] = {
          ...p,
          // Se o stream já tem um preço mais recente que o snapshot, mantém o do stream.
          price: streamPrice && streamPrice.lastUpdated > now ? streamPrice.price : p.price,
          lastUpdated: now,
        };
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
      setError(null);
    } catch (err) {
      console.error("[useLivePrices] getMarketSnapshot falhou:", err);
      // Não limpa preços existentes — preserva último valor bom (do stream ou poll anterior).
      setError("Falha ao buscar snapshot. Usando dados do stream.");
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

  return { prices, global, fearGreed, loading, error, lastUpdate, refresh: fetchAll };
}
