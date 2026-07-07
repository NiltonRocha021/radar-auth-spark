// Hook de preço por símbolo — porta o antigo `GET /prices/:symbol` do Nest
// para a server fn `getPriceBySymbol` (fonte: market_snapshot via RLS do
// usuário autenticado). Sem `apiClient`, sem localhost:3001.
//
// Contrato mantido: retorna `number | null`, polling a cada 5s.
// Consumidor único hoje é dead code, mas mantemos o hook porque outros
// componentes podem re-adotá-lo — melhor apontar para a fonte correta.
import { useEffect, useState } from "react";
import { getPriceBySymbol } from "@/lib/prices.functions";

export function usePrices(symbol: string) {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;

    const fetchPrice = async () => {
      try {
        const res = await getPriceBySymbol({ data: { symbol } });
        if (cancelled) return;
        // res pode ser { symbol, price: null, error: 'not_found' }
        setPrice(res.price ?? null);
      } catch (error) {
        console.error("[usePrices] getPriceBySymbol falhou:", error);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol]);

  return price;
}
