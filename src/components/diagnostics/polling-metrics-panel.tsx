// Painel de diagnóstico de polling: latência, taxa de falha, últimas
// atualizações e últimos erros estruturados — atualizado em tempo quase real
// (a store zustand é atualizada a cada ciclo).
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Timer } from "lucide-react";
import {
  usePollMetricsStore,
  recentFailureRate,
  isDegraded,
  RECENT_WINDOW,
  type PollMetrics,
  type PollSource,
} from "@/lib/polling-metrics";

const LABEL: Record<PollSource, string> = { signals: "Sinais", bot4x: "Bot 4X" };

function ago(ts: number | null, now: number) {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `há ${m}min` : `há ${Math.floor(m / 60)}h`;
}

function SourceCard({ m, now }: { m: PollMetrics; now: number }) {
  const degraded = isDegraded(m);
  const rate = Math.round(recentFailureRate(m) * 100);
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" aria-hidden />
          {LABEL[m.source]}
        </h3>
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full border ${
            degraded
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {degraded ? "degradado" : "estável"}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Latência (última)</dt>
          <dd className="font-mono">{m.lastLatencyMs ?? "—"} ms</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Latência (média)</dt>
          <dd className="font-mono">{m.avgLatencyMs ?? "—"} ms</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Falhas (últimos {RECENT_WINDOW})</dt>
          <dd className="font-mono">{rate}%</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ciclos ok / falha</dt>
          <dd className="font-mono">
            {m.success} / {m.failure}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Última atualização</dt>
          <dd className="flex items-center gap-1">
            <CheckCircle2 className="size-3 text-emerald-500" aria-hidden />
            {ago(m.lastSuccessAt, now)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Última falha</dt>
          <dd className="flex items-center gap-1">
            <AlertTriangle className="size-3 text-amber-500" aria-hidden />
            {ago(m.lastFailureAt, now)}
          </dd>
        </div>
      </dl>

      {m.nextRetryAt && m.nextRetryAt > now && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Timer className="size-3" aria-hidden />
          Novo retry em ~{Math.ceil((m.nextRetryAt - now) / 1000)}s (backoff, {m.consecutiveFailures} falha
          {m.consecutiveFailures === 1 ? "" : "s"} seguida{m.consecutiveFailures === 1 ? "" : "s"})
        </p>
      )}

      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Últimos erros</p>
        {m.errors.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum erro registrado.</p>
        ) : (
          <ul className="space-y-1">
            {m.errors.map((e, i) => (
              <li key={`${e.at}-${i}`} className="text-[11px] font-mono text-muted-foreground truncate">
                <span className="text-destructive">{new Date(e.at).toLocaleTimeString()}</span> · {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PollingMetricsPanel() {
  const metrics = usePollMetricsStore((s) => s.metrics);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="space-y-3" aria-label="Diagnóstico de polling">
      <header>
        <h2 className="text-sm font-semibold">Diagnóstico de atualização (polling)</h2>
        <p className="text-xs text-muted-foreground">
          Latência, taxa de falha e últimos erros dos ciclos de sinais e do bot.
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {(Object.values(metrics) as PollMetrics[]).map((m) => (
          <SourceCard key={m.source} m={m} now={now} />
        ))}
      </div>
    </section>
  );
}
