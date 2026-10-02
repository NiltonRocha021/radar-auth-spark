// Card de regime de mercado com estados explícitos (loading / erro / vazio).
import { useQuery } from "@tanstack/react-query";
import { getCurrentMarketRegimes, type MarketRegimeDTO } from "@/lib/market-regime.functions";
import { AsyncState, LoadingState } from "@/components/common/async-state";

const REGIME_LABEL: Record<string, string> = {
  RANGE: "Lateral",
  VOLATILE: "Volátil",
  TRENDING_BULL: "Tendência de alta",
  TRENDING_BEAR: "Tendência de baixa",
};

export function MarketRegimeCard() {
  const query = useQuery({
    queryKey: ["market-regime", "top20"],
    queryFn: () => getCurrentMarketRegimes({ data: { timeframe: "1h" } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const data = query.data ?? [];
  const available = data.filter((item) => !item.signals.includes("NO_DATA"));

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4" aria-label="Regime de mercado">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">Regime de mercado</h2>
          <p className="text-xs text-muted-foreground">{available.length}/20 pares Binance · 1H</p>
        </div>
      </div>

      <AsyncState
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        isEmpty={query.isSuccess && available.length === 0}
        onRetry={() => void query.refetch()}
        loading={<LoadingState rows={1} label="Carregando regimes de mercado" />}
        errorTitle="Não foi possível ler os regimes de mercado"
        errorMessage="Os indicadores não puderam ser calculados agora. Tente novamente em instantes."
        empty={<p className="text-xs text-muted-foreground">Ainda não há velas suficientes para classificar os regimes dos pares.</p>}
      >
        {available.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {available.map((item: MarketRegimeDTO) => (
              <div key={item.pair} className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{item.pair}</span>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    {REGIME_LABEL[item.regime] ?? item.regime}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
                  <Metric label="Trend" value={item.trend} />
                  <Metric label="Vol" value={item.volatility} />
                  <Metric label="Score" value={String(item.score) + "%"} />
                </div>
              </div>
            ))}
          </div>
        )}
      </AsyncState>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
