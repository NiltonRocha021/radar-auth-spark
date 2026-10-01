// Trades por par — histórico de ordens em gráfico e taxa de sucesso,
// alimentado pelo mesmo polling do bot LIVE (15s).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getPairAnalytics } from "@/lib/orders.functions";
import { TopBar } from "@/components/dashboard/top-bar";
import { LeftSidebar } from "@/components/dashboard/left-sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AsyncState, EmptyState } from "@/components/common/async-state";

export const Route = createFileRoute("/_authenticated/pairs")({
  head: () => ({
    meta: [
      { title: "Trades por par — AISignalRadar" },
      {
        name: "description",
        content:
          "Desempenho de cada par operado pelo bot: histórico de ordens em gráfico, taxa de sucesso, custos e ROI.",
      },
      { property: "og:title", content: "Trades por par — AISignalRadar" },
      {
        property: "og:description",
        content: "Histórico de ordens por par, taxa de sucesso e ROI do bot LIVE e DEMO.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os pares."}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
  component: PairsPage,
});

const MODES = ["LIVE", "DEMO", "TODOS"] as const;
type ModeFilter = (typeof MODES)[number];

const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

function PairsPage() {
  const [mode, setMode] = useState<ModeFilter>("LIVE");
  const [selected, setSelected] = useState<string | null>(null);
  const fn = useServerFn(getPairAnalytics);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["orders", "pairs", mode],
    queryFn: () => fn({ data: { mode: mode === "TODOS" ? undefined : mode, limit: 1000 } }),
    refetchInterval: 15_000,
  });

  const activeSymbol = selected ?? data?.pairs[0]?.symbol ?? null;
  const series = useMemo(() => {
    if (!data || !activeSymbol) return [];
    return (data.equityBySymbol[activeSymbol] ?? []).map((p) => ({
      t: new Date(p.t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      cum: Number(p.cum.toFixed(2)),
      pnl: Number(p.pnl.toFixed(2)),
    }));
  }, [data, activeSymbol]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <div className="flex">
        <LeftSidebar />
        <main className="flex-1 min-w-0 p-5 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Trades por par</h1>
              <p className="text-sm text-muted-foreground">
                Histórico de ordens e taxa de sucesso por par, atualizado a cada 15 segundos.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {MODES.map((m) => (
                <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
                  {m}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => refetch()} aria-label="Atualizar agora">
                <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <AsyncState
            isLoading={isLoading}
            error={error as Error | null}
            isEmpty={!!data && data.pairs.length === 0}
            onRetry={() => refetch()}
            empty={
              <EmptyState
                title="Nenhum par operado neste modo"
                message="Assim que o bot executar ordens, o desempenho de cada par aparece aqui."
              />
            }
          >
            {data && (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                  <SummaryTile label="Ordens" value={String(data.totals.orders)} />
                  <SummaryTile label="Encerradas" value={String(data.totals.closedOrders)} />
                  <SummaryTile label="Taxa de sucesso" value={`${data.totals.winRate.toFixed(1)}%`} />
                  <SummaryTile
                    label="Resultado líquido"
                    value={money(data.totals.netPnl)}
                    tone={data.totals.netPnl >= 0 ? "text-[#1D9E75]" : "text-[#E24B4A]"}
                  />
                  <SummaryTile label="Saldo atual" value={money(data.totals.balance)} tone={data.totals.balance >= 0 ? "text-success" : "text-destructive"} />
                  <SummaryTile label="Custos" value={money(data.totals.fees)} />
                  <SummaryTile label="ROI acumulado" value={pct(data.totals.roiPct)} tone={data.totals.roiPct >= 0 ? "text-success" : "text-destructive"} />
                </div>

                <Card>
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-base">
                      Histórico de ordens {activeSymbol ? `· ${activeSymbol}` : ""}
                    </CardTitle>
                    <div className="flex flex-wrap gap-1.5">
                      {data.pairs.slice(0, 8).map((p) => (
                        <Button
                          key={p.symbol}
                          size="sm"
                          variant={p.symbol === activeSymbol ? "default" : "outline"}
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setSelected(p.symbol)}
                        >
                          {p.symbol}
                        </Button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {series.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        Ainda não há ordens encerradas neste par para desenhar o gráfico.
                      </p>
                    ) : (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                            <XAxis dataKey="t" tick={{ fontSize: 11 }} minTickGap={24} />
                            <YAxis tick={{ fontSize: 11 }} width={64} />
                            <ReTooltip
                              contentStyle={{
                                background: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                              formatter={(v: number, name) => [money(v), name === "cum" ? "Acumulado" : "Ordem"]}
                            />
                            <Area
                              type="monotone"
                              dataKey="cum"
                              stroke="hsl(var(--primary))"
                              fill="url(#pnlFill)"
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Desempenho por par</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[13px] tabular-nums">
                        <thead>
                          <tr className="text-left text-[11px] uppercase text-muted-foreground border-b border-border">
                            <th className="py-2 pr-3">Par</th>
                            <th className="py-2 pr-3">Ordens</th>
                            <th className="py-2 pr-3">Abertas</th>
                            <th className="py-2 pr-3">Taxa de sucesso</th>
                            <th className="py-2 pr-3">Custos</th>
                            <th className="py-2 pr-3">Líquido</th>
                            <th className="py-2 pr-3">ROI</th>
                            <th className="py-2">Última ordem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.pairs.map((p) => {
                            const tone = p.netPnl >= 0 ? "text-[#1D9E75]" : "text-[#E24B4A]";
                            return (
                              <tr
                                key={p.symbol}
                                className={`border-b border-border/50 hover:bg-muted/40 cursor-pointer ${
                                  p.symbol === activeSymbol ? "bg-muted/30" : ""
                                }`}
                                onClick={() => setSelected(p.symbol)}
                              >
                                <td className="py-2 pr-3 font-medium">{p.symbol}</td>
                                <td className="py-2 pr-3">{p.orders}</td>
                                <td className="py-2 pr-3">
                                  {p.openOrders > 0 ? (
                                    <Badge className="bg-[#1D9E75]/15 text-[#1D9E75] border-0">{p.openOrders}</Badge>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="py-2 pr-3">
                                  <div className="flex items-center gap-2">
                                    <Progress value={p.winRate} className="h-1.5 w-20" />
                                    <span>{p.winRate.toFixed(1)}%</span>
                                  </div>
                                </td>
                                <td className="py-2 pr-3">{money(p.fees)}</td>
                                <td className={`py-2 pr-3 ${tone}`}>{money(p.netPnl)}</td>
                                <td className={`py-2 pr-3 ${tone}`}>{pct(p.roiPct)}</td>
                                <td className="py-2 text-muted-foreground">
                                  {new Date(p.lastOrderAt).toLocaleString("pt-BR")}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </AsyncState>
        </main>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
        <p className={`text-xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
