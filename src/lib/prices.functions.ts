// Server functions de leitura de preços.
// Porta PricesController do Nest (GET /prices, GET /prices/:symbol).
// Fonte no Nest: PricesService.findAll() (Redis + Binance).
// Fonte aqui: tabela `market_snapshot` — populada por job externo/edge que
// espelha os preços mais recentes por símbolo.
//
// NOTA: `market.functions.ts` continua sendo a fonte pública (CoinGecko +
// fallback Binance) usada por dashboards não-autenticados. Este arquivo é
// especificamente o port do endpoint autenticado do Nest.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PriceDTO {
  symbol: string;
  price: number;
  volume24h: number | null;
  marketCap: number | null;
  change24h: number | null;
  source: string | null;
  capturedAt: string | null;
}

type SnapshotRow = {
  symbol: string;
  price: number | null;
  volume_24h: number | null;
  market_cap: number | null;
  change_24h: number | null;
  source: string | null;
  captured_at: string | null;
};

function toDTO(r: SnapshotRow): PriceDTO {
  return {
    symbol: r.symbol,
    price: Number(r.price ?? 0),
    volume24h: r.volume_24h != null ? Number(r.volume_24h) : null,
    marketCap: r.market_cap != null ? Number(r.market_cap) : null,
    change24h: r.change_24h != null ? Number(r.change_24h) : null,
    source: r.source,
    capturedAt: r.captured_at,
  };
}

/**
 * GET /prices — replica PricesController.findAll.
 * Retorna o snapshot mais recente por símbolo (DISTINCT ON via order + limit
 * já ordenado; como o Data API não expõe DISTINCT ON, agregamos client-side).
 */
export const listPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PriceDTO[]> => {
    const { data, error } = await context.supabase
      .from("market_snapshot")
      .select("symbol,price,volume_24h,market_cap,change_24h,source,captured_at")
      .order("captured_at", { ascending: false })
      .limit(500);
    if (error) {
      console.warn("[prices.functions] listPrices error:", error.message);
      return [];
    }
    // Mantém apenas a linha mais recente por símbolo.
    const latestBySymbol = new Map<string, SnapshotRow>();
    for (const row of (data ?? []) as SnapshotRow[]) {
      if (!latestBySymbol.has(row.symbol)) latestBySymbol.set(row.symbol, row);
    }
    return Array.from(latestBySymbol.values()).map(toDTO);
  });

/**
 * GET /prices/:symbol — replica PricesController.findOne.
 * Normalização do símbolo idêntica ao Nest: uppercase, remove `-` e `/`.
 * Retorna `{ symbol, price: null, error: 'not_found' }` quando ausente,
 * para preservar o contrato de resposta.
 */
export const getPriceBySymbol = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { symbol: string }) => {
    if (!input?.symbol) throw new Error("symbol obrigatório");
    return { symbol: String(input.symbol).toUpperCase().replace(/[-/]/g, "") };
  })
  .handler(
    async ({ data, context }): Promise<PriceDTO | { symbol: string; price: null; error: "not_found" }> => {
      // Tenta match exato primeiro; se falhar, faz varredura por normalização.
      const { data: exact } = await context.supabase
        .from("market_snapshot")
        .select("symbol,price,volume_24h,market_cap,change_24h,source,captured_at")
        .eq("symbol", data.symbol)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (exact) return toDTO(exact as SnapshotRow);

      const { data: all } = await context.supabase
        .from("market_snapshot")
        .select("symbol,price,volume_24h,market_cap,change_24h,source,captured_at")
        .order("captured_at", { ascending: false })
        .limit(500);
      const match = ((all ?? []) as SnapshotRow[]).find(
        (r) => r.symbol.toUpperCase().replace(/[-/]/g, "") === data.symbol,
      );
      if (match) return toDTO(match);

      return { symbol: data.symbol, price: null, error: "not_found" };
    },
  );
