// Custos por ordem + ROI acumulado, comparando execução real (LIVE) e DEMO.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getOrdersAnalytics, type ModeAnalyticsDTO } from "@/lib/orders.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AsyncState, EmptyState } from "@/components/common/async-state";

const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

function ModeColumn({ m, label, accent }: { m: ModeAnalyticsDTO; label: string; accent: string }) {
  const tone = m.netPnl >= 0 ? "text-[#1D9E75]" : "text-[#E24B4A]";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`size-1.5 rounded-full ${accent}`} />
        <span className="text-sm font-medium">{label}</span>
        <Badge variant="outline" className="text-[10px]">{m.orders} ordens</Badge>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] tabular-nums">
        <Row label="Saldo atual (realizado)" value={<span className={tone}>{money(m.balance)}</span>} />
        <Row label="Exposição em aberto" value={money(m.openExposure)} />
        <Row label="ROI acumulado" value={<span className={tone}>{pct(m.roiPct)}</span>} />
        <Row label="Resultado líquido" value={<span className={tone}>{money(m.netPnl)}</span>} />
        <Row label="Resultado bruto" value={money(m.grossPnl)} />
        <Row label="Custos (taxas)" value={money(m.fees)} />
        <Row label="Custo médio/ordem" value={money(m.avgFeePerOrder)} />
        <Row label="Volume operado" value={money(m.volume)} />
        <Row label="Taxa de acerto" value={`${m.winRate.toFixed(1)}%`} />
        <Row label="Abertas" value={String(m.openOrders)} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export function CostsRoiCard() {
  const fn = useServerFn(getOrdersAnalytics);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["orders", "analytics"],
    queryFn: () => fn({ data: {} }),
    refetchInterval: 15_000,
  });

  const diff = data ? data.live.roiPct - data.demo.roiPct : 0;

  return (
    <Card data-tour="costs-roi">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">Custos e ROI acumulado</CardTitle>
        <Link to="/trades" className="text-xs text-muted-foreground hover:text-foreground">
          Ver trades reais →
        </Link>
      </CardHeader>
      <CardContent>
        <AsyncState
          isLoading={isLoading}
          error={error as Error | null}
          isEmpty={!!data && data.demo.orders === 0 && data.live.orders === 0}
          empty={
            <EmptyState
              title="Nenhuma ordem registrada"
              message="Assim que o bot executar ordens, os custos e o ROI acumulado aparecem aqui."
            />
          }
          onRetry={() => refetch()}
        >
          {data && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                <ModeColumn m={data.live} label="LIVE (real)" accent="bg-[#1D9E75]" />
                <ModeColumn m={data.demo} label="DEMO (simulado)" accent="bg-[#EF9F27]" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Diferença de ROI real vs simulado:{" "}
                <span className={diff >= 0 ? "text-[#1D9E75]" : "text-[#E24B4A]"}>{pct(diff)}</span>
                {" · "}taxa considerada por perna: {(data.feeRate * 100).toFixed(2)}%
              </p>
            </div>
          )}
        </AsyncState>
      </CardContent>
    </Card>
  );
}
