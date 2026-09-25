import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useBackendAuth } from "@/hooks/useBackendAuth";
import { useDashboardStore } from "@/lib/dashboard-store";
import { TopBar } from "@/components/dashboard/top-bar";
import { LeftSidebar } from "@/components/dashboard/left-sidebar";
import { MetricCards } from "@/components/dashboard/metric-cards";
import { SignalsTable } from "@/components/dashboard/signals-table";
import { FearGreedGauge } from "@/components/dashboard/fear-greed-gauge";
import { AssetHeatmap } from "@/components/dashboard/asset-heatmap";
import { BtcDominance } from "@/components/dashboard/btc-dominance";
import { DnaPanel } from "@/components/dashboard/dna-panel";
import { AlertsFeed } from "@/components/dashboard/alerts-feed";
import { Sentiment } from "@/components/dashboard/sentiment";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
import { MarketCalendar } from "@/components/dashboard/market-calendar";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { LiveToasts } from "@/components/dashboard/live-toasts";
import { SignalDrawer } from "@/components/dashboard/signal-drawer";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { IntegrationWidgets } from "@/components/dashboard/integration-widgets";
import { PollingAlertBanner } from "@/components/diagnostics/polling-alert-banner";
import { PollingMetricsPanel } from "@/components/diagnostics/polling-metrics-panel";
import { CostsRoiCard } from "@/components/dashboard/costs-roi-card";
import { LiveRiskPanel } from "@/components/dashboard/live-risk-panel";
import { PairPerformanceCard } from "@/components/trades/pair-performance-card";
import { ProfileCapitalCard } from "@/components/dashboard/profile-capital-card";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — AISignalRadar" },
      { name: "description", content: "Acompanhe sinais, ordens, risco por par e ROI acumulado do bot." },
      { property: "og:title", content: "Dashboard — AISignalRadar" },
      { property: "og:description", content: "Sinais, ordens, risco por par e ROI acumulado em tempo quase real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { userId, ready } = useBackendAuth();
  const navigate = useNavigate();
  const init = useDashboardStore((s) => s.init);
  const cleanup = useDashboardStore((s) => s.cleanup);

  useEffect(() => {
    if (ready && !userId) navigate({ to: "/login" });
  }, [ready, userId, navigate]);

  useEffect(() => {
    if (!ready || !userId) return;
    init();
    return () => cleanup();
  }, [ready, userId, init, cleanup]);

  if (!ready || !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <AnnouncementBanner />
      <PollingAlertBanner />
      <div className="flex">
        <LeftSidebar />
        <main className="flex-1 min-w-0 p-5 space-y-5">
          <IntegrationWidgets />
          <MetricCards />

          <CostsRoiCard />
          <ProfileCapitalCard />
          <LiveRiskPanel />
          <PairPerformanceCard />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3"><SignalsTable /></div>
            <div className="lg:col-span-2"><FearGreedGauge /></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3"><AssetHeatmap /></div>
            <div className="lg:col-span-2"><BtcDominance /></div>
          </div>

          <DnaPanel />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3"><AlertsFeed /></div>
            <div className="lg:col-span-2"><Sentiment /></div>
          </div>

          <PerformanceChart />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3"><MarketCalendar /></div>
            <div className="lg:col-span-2"><QuickActions /></div>
          </div>

          <PollingMetricsPanel />
        </main>
      </div>

      <LiveToasts />
      <SignalDrawer />
      <CommandPalette />
    </div>
  );
}
