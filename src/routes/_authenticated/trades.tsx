// Tela de trades reais — ordem, preço, tempo e status, em polling contínuo
// junto do bot LIVE. Mostra LIVE e DEMO lado a lado para comparação.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { listOrders, type OrderDTO } from "@/lib/orders.functions";
import { TopBar } from "@/components/dashboard/top-bar";
import { LeftSidebar } from "@/components/dashboard/left-sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AsyncState, EmptyState } from "@/components/common/async-state";
import { CostsRoiCard } from "@/components/dashboard/costs-roi-card";
import { PairPerformanceCard } from "@/components/trades/pair-performance-card";
import { getBotConfig } from "@/lib/bot.functions";
import { ProfileCapitalCard } from "@/components/dashboard/profile-capital-card";

export const Route = createFileRoute("/_authenticated/trades")({
  head: () => ({
    meta: [
      { title: "Trades reais — AISignalRadar" },
      { name: "description", content: "Acompanhe as ordens executadas pelo bot em tempo real: preço, horário, status e custos." },
      { property: "og:title", content: "Trades reais — AISignalRadar" },
      { property: "og:description", content: "Ordens LIVE e DEMO do seu bot, com preço, horário, status e ROI acumulado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar as operações."}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado</div>,
  component: TradesPage,
});

const MODES = ["LIVE", "DEMO", "TODOS"] as const;
type ModeFilter = (typeof MODES)[number];

const money = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 6 });

function statusBadge(status: OrderDTO["status"]) {
  if (status === "OPEN") return <Badge className="bg-[#1D9E75]/15 text-[#1D9E75] border-0">Aberta</Badge>;
  if (status === "CLOSED") return <Badge variant="secondary">Encerrada</Badge>;
  return <Badge variant="outline">Cancelada</Badge>;
}

function TradesPage() {
  const [mode, setMode] = useState<ModeFilter | null>(null);
  const fn = useServerFn(listOrders);
  const configFn = useServerFn(getBotConfig);
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ["bot-config"], queryFn: () => configFn() });
  const activeMode: ModeFilter = mode ?? config.data?.executionMode ?? "DEMO";

  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["orders", "list", activeMode],
    queryFn: () => fn({ data: { mode: activeMode === "TODOS" ? undefined : activeMode, limit: 200 } }),
    refetchInterval: 15_000,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <div className="flex">
        <LeftSidebar />
        <main className="flex-1 min-w-0 p-5 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Trades reais</h1>
              <p className="text-sm text-muted-foreground">
                Ordens executadas pelo bot, atualizadas a cada 15 segundos.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {MODES.map((m) => (
                 <Button key={m} size="sm" variant={activeMode === m ? "default" : "outline"} onClick={() => setMode(m)}>
                  {m}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  refetch();
                  qc.invalidateQueries({ queryKey: ["orders", "analytics"] });
                }}
                aria-label="Atualizar agora"
              >
                <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <CostsRoiCard />
          <ProfileCapitalCard />
          <PairPerformanceCard />

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Histórico de ordens</CardTitle>
              <span className="text-[11px] text-muted-foreground">
                {dataUpdatedAt ? `Atualizado às ${new Date(dataUpdatedAt).toLocaleTimeString("pt-BR")}` : ""}
              </span>
            </CardHeader>
            <CardContent>
              <AsyncState
                isLoading={isLoading}
                error={error}
                isEmpty={!!data && data.length === 0}
                onRetry={() => refetch()}
                empty={
                  <EmptyState
                    title="Nenhuma ordem neste modo"
                    message="Quando o bot executar uma ordem, ela aparece aqui em segundos."
                  />
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px] tabular-nums">
                    <thead>
                      <tr className="text-left text-[11px] uppercase text-muted-foreground border-b border-border">
                        <th className="py-2 pr-3">Ordem</th>
                        <th className="py-2 pr-3">Modo</th>
                        <th className="py-2 pr-3">Lado</th>
                        <th className="py-2 pr-3">Qtd.</th>
                        <th className="py-2 pr-3">Entrada</th>
                        <th className="py-2 pr-3">Saída</th>
                        <th className="py-2 pr-3">Resultado</th>
                        <th className="py-2 pr-3">Abertura</th>
                        <th className="py-2 pr-3">Fechamento</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data ?? []).map((o) => {
                        const tone = (o.pnl ?? 0) >= 0 ? "text-[#1D9E75]" : "text-[#E24B4A]";
                        return (
                          <tr key={o.id} className="border-b border-border/50 hover:bg-muted/40">
                            <td className="py-2 pr-3">
                              <div className="font-medium">{o.symbol}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{o.id.slice(0, 8)}</div>
                            </td>
                            <td className="py-2 pr-3">
                              <Badge variant={o.mode === "LIVE" ? "default" : "outline"} className="text-[10px]">
                                {o.mode}
                              </Badge>
                            </td>
                            <td className={`py-2 pr-3 ${o.side === "BUY" ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}>
                              {o.side}
                            </td>
                            <td className="py-2 pr-3">{o.quantity}</td>
                            <td className="py-2 pr-3">{money(o.entryPrice)}</td>
                            <td className="py-2 pr-3">{money(o.exitPrice)}</td>
                            <td className={`py-2 pr-3 ${tone}`}>
                              {o.pnl == null ? "—" : `${money(o.pnl)} (${(o.pnlPct ?? 0).toFixed(2)}%)`}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">
                              {new Date(o.openedAt).toLocaleString("pt-BR")}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">
                              {o.closedAt ? new Date(o.closedAt).toLocaleString("pt-BR") : "—"}
                            </td>
                            <td className="py-2">{statusBadge(o.status)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </AsyncState>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
