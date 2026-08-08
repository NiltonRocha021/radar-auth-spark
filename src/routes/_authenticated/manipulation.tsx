import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/dashboard/top-bar";
import { LeftSidebar } from "@/components/dashboard/left-sidebar";
import { AlertBanner } from "@/components/manipulation/alert-banner";
import { InstitutionalHeatmap } from "@/components/manipulation/institutional-heatmap";
import { AlertsFeed } from "@/components/manipulation/alerts-feed";
import { SmartMoney } from "@/components/manipulation/smart-money";
import { LiquidityMap } from "@/components/manipulation/liquidity-map";
import { AggressionAnalysis } from "@/components/manipulation/aggression-analysis";
import { HistoricalLog } from "@/components/manipulation/historical-log";
import { ALERTS as MOCK_ALERTS } from "@/lib/manipulation-data";
import { listManipulationAlerts } from "@/lib/manipulation.functions";
import { mapManipulationAlert } from "@/lib/manipulation-map";

export const Route = createFileRoute("/_authenticated/manipulation")({
  head: () => ({
    meta: [
      { title: "Manipulation Radar — AISignalRadar" },
      { name: "description", content: "Institutional surveillance: stop hunts, liquidity grabs, spoofing and smart-money order flow detection in real time." },
    ],
  }),
  component: ManipulationPage,
});

function ManipulationPage() {
  const [dismissed, setDismissed] = useState(false);

  const alertsQuery = useQuery({
    queryKey: ["manipulation-alerts"],
    queryFn: async () => (await listManipulationAlerts({ data: {} })).map(mapManipulationAlert),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const liveAlerts = alertsQuery.data;

  // Em dev caímos nos mocks para visualização; em produção o estado vazio é
  // explícito para não induzir decisão com dado fictício.
  const fallback = import.meta.env.DEV ? MOCK_ALERTS : [];
  const alerts = liveAlerts?.length ? liveAlerts : fallback;
  const activeAssets = Array.from(new Set(alerts.map((a) => a.asset)));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <div className="flex">
        <LeftSidebar />
        <main className="flex-1 min-w-0 p-5 space-y-5">
          <header>
            <h1 className="text-xl font-semibold tracking-tight">Manipulation Radar</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time institutional surveillance — stop hunts, spoofing, liquidity sweeps, and smart-money flow.
            </p>
          </header>

          {!dismissed && alerts.length > 0 && (
            <AlertBanner count={alerts.length} assets={activeAssets} onDismiss={() => setDismissed(true)} />
          )}

          <InstitutionalHeatmap />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3">
              <AsyncState
                isLoading={alertsQuery.isLoading}
                error={alertsQuery.isError ? alertsQuery.error : undefined}
                isEmpty={!alerts.length}
                onRetry={() => void alertsQuery.refetch()}
                loading={<LoadingState rows={4} label="Carregando alertas de manipulação" />}
                errorTitle="Não foi possível carregar os alertas"
                errorMessage="A vigilância institucional está indisponível no momento. Tente novamente em instantes."
                empty={
                  <EmptyState
                    title="Nenhuma manipulação detectada"
                    message="Nenhum evento institucional suspeito foi identificado no período recente."
                  />
                }
              >
                <AlertsFeed alerts={alerts} />
              </AsyncState>
            </div>
            <div className="lg:col-span-2">
              <SmartMoney />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <LiquidityMap />
            <AggressionAnalysis />
          </div>

          <HistoricalLog />
        </main>
      </div>
    </div>
  );
}
