import { useEffect, useState } from 'react';

export interface MarketContextData {
  asset?: string;
  price?: number;
  regime?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'VOLATILE';
  aiScore?: number;
  priceActionScore?: number;
  indicatorsScore?: number;
  flowScore?: number;
  sentimentScore?: number;
  aiPredictiveScore?: number;
  macroScore?: number;
  manipulationScore?: number;
  bot4xActive?: boolean;
  bot4xProfile?: string;
  bot4xDailyPnl?: number;
  bot4xOpenSlots?: number;
  bot4xCircuitBreaker?: 'none' | 'emergency' | 'profitLock';
  activeSignals?: number;
  topSignalScore?: number;
  topSignalAsset?: string;
  topSignalDirection?: 'BUY' | 'SELL';
}

/**
 * Stub: as tabelas `signals` e `bot4x_configs` ainda não existem no Supabase.
 * Quando forem criadas (ou quando o backend NestJS expuser endpoints REST/WS),
 * este hook deve ser preenchido com os reads correspondentes.
 */
export function useMarketContext(userId: string | undefined): {
  marketContext: MarketContextData;
  loading: boolean;
} {
  const [marketContext, setMarketContext] = useState<MarketContextData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setMarketContext({});
    setLoading(false);
  }, [userId]);

  return { marketContext, loading };
}
