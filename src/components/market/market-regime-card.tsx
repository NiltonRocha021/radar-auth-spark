// Card de regime de mercado com estados explícitos (loading / erro / vazio).
import { useQuery } from "@tanstack/react-query";
import { getCurrentMarketRegime } from "@/lib/market-regime.functions";
import { AsyncState, LoadingState } from "@/components/common/async-state";

const REGIME_LABEL: Record<string, string> = {
  RANGE: "Lateral",
  VOLATILE: "Volátil",
  TRENDING_BULL: "Tendência de alta",
  TRENDING_BEAR: "Tendência de baixa",
};

export function MarketRegimeCard({ pair = "BTC/USDT" }: { pair?: string }) {
  const query = useQuery({
    queryKey: ["market-regime", pair],
    queryFn: () => getCurrentMarketRegime({ data: { pair } }),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });

  const data = query.data;
  const noData = !!data && data.signals.includes("NO_DATA");

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4" aria-label="Regime de mercado">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">Regime de mercado</h2>
          <p className="text-xs text-muted-foreground">{pair}</p>
        </div>
        {data && !noData && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-foreground/10 font-semibold">
            {REGIME_LABEL[data.regime] ?? data.regime}
          </span>
        )}
      </div>

      <AsyncState
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        isEmpty={noData}
        onRetry={() => void query.refetch()}
        loading={<LoadingState rows={1} label="Carregando regime de mercado" />}
        errorTitle="Não foi possível ler o regime de mercado"
        errorMessage="Os indicadores de tendência não puderam ser calculados agora. Tente novamente em instantes."
        empty={
          <p className="text-xs text-muted-foreground">
            Ainda não há velas suficientes para classificar o regime deste par.
          </p>
        }
      >
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Metric label="Tendência" value={data.trend} />
            <Metric label="Volatilidade" value={data.volatility} />
            <Metric label="Força" value={`${data.strength}`} />
            <Metric label="Confiança" value={`${data.score}%`} />
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
