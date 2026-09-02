// Alerta automático quando o polling degrada (taxa de falha recente > limiar).
import { AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  usePollMetricsStore,
  isDegraded,
  recentFailureRate,
  type PollMetrics,
  type PollSource,
} from "@/lib/polling-metrics";

const LABEL: Record<PollSource, string> = { signals: "Sinais", bot4x: "Bot 4X" };

export function PollingAlertBanner() {
  const metrics = usePollMetricsStore((s) => s.metrics);
  const degraded = (Object.values(metrics) as PollMetrics[]).filter(isDegraded);
  if (!degraded.length) return null;

  return (
    <div
      role="alert"
      className="mx-5 mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 flex items-start gap-2.5"
    >
      <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" aria-hidden />
      <div className="text-xs leading-relaxed">
        <p className="font-semibold text-destructive">Atualização instável</p>
        <p className="text-muted-foreground">
          {degraded
            .map((m) => `${LABEL[m.source]}: ${Math.round(recentFailureRate(m) * 100)}% dos últimos ciclos falharam`)
            .join(" · ")}
          . Os dados na tela podem estar desatualizados.{" "}
          <Link to="/diagnostics" className="underline underline-offset-2">
            Ver diagnósticos
          </Link>
        </p>
      </div>
    </div>
  );
}
