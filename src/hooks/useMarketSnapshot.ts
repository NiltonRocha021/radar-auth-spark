// src/hooks/useMarketSnapshot.ts
// Produz um MarketSnapshot com dados reais de Fear&Greed e BTC Dominance
// (e candles D1 do BTC) para consumo pelos engines.
import { useLivePrices } from "./useLivePrices";
import { useBTCCandles } from "./useBTCCandles";
import { mockBTCSnapshot, type MarketSnapshot } from "@/lib/engine-scoring";

export function useMarketSnapshot(symbol?: string): {
  snapshot: MarketSnapshot;
  isLive: boolean;
} {
  const { prices, global, fearGreed, loading } = useLivePrices();
  const btcCandles = useBTCCandles(35);

  if (loading || !global || !fearGreed) {
    return {
      snapshot: { ...mockBTCSnapshot, btcCandles: btcCandles.length ? btcCandles : mockBTCSnapshot.btcCandles },
      isLive: false,
    };
  }

  const price =
    symbol && prices[symbol]?.price ? prices[symbol].price : mockBTCSnapshot.price;

  const snapshot: MarketSnapshot = {
    ...mockBTCSnapshot,
    price,
    triggerPrice: price,
    fearGreedIndex: fearGreed.value,
    btcDominance: global.btcDominance,
    btcCandles: btcCandles.length ? btcCandles : mockBTCSnapshot.btcCandles,
  };

  return { snapshot, isLive: true };
}
