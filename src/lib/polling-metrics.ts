// Métricas de polling — instrumentação leve para diagnosticar LIVE.
//
// Cada fonte de polling (sinais, bot) registra início/fim de cada ciclo.
// Guardamos latência (última + média móvel), contagem de sucessos/falhas,
// timestamps da última atualização e o último erro. Também emitimos log
// estruturado a cada ciclo (warn em falha, debug em sucesso).
import { create } from "zustand";
import { logger } from "./logger";

export type PollSource = "signals" | "bot4x";

export interface PollMetrics {
  source: PollSource;
  lastLatencyMs: number | null;
  avgLatencyMs: number | null;
  success: number;
  failure: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
}

function emptyMetrics(source: PollSource): PollMetrics {
  return {
    source,
    lastLatencyMs: null,
    avgLatencyMs: null,
    success: 0,
    failure: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };
}

type MetricsState = {
  metrics: Record<PollSource, PollMetrics>;
  record: (source: PollSource, latencyMs: number, error?: unknown, extra?: Record<string, unknown>) => void;
  reset: (source: PollSource) => void;
};

export const usePollMetricsStore = create<MetricsState>((set, get) => ({
  metrics: { signals: emptyMetrics("signals"), bot4x: emptyMetrics("bot4x") },
  reset: (source) =>
    set((s) => ({ metrics: { ...s.metrics, [source]: emptyMetrics(source) } })),
  record: (source, latencyMs, error, extra) => {
    const prev = get().metrics[source] ?? emptyMetrics(source);
    const failed = error !== undefined && error !== null;
    const total = prev.success + prev.failure;
    const avg =
      prev.avgLatencyMs === null ? latencyMs : (prev.avgLatencyMs * total + latencyMs) / (total + 1);

    const next: PollMetrics = {
      source,
      lastLatencyMs: Math.round(latencyMs),
      avgLatencyMs: Math.round(avg),
      success: prev.success + (failed ? 0 : 1),
      failure: prev.failure + (failed ? 1 : 0),
      lastSuccessAt: failed ? prev.lastSuccessAt : Date.now(),
      lastFailureAt: failed ? Date.now() : prev.lastFailureAt,
      lastError: failed ? (error instanceof Error ? error.message : String(error)) : null,
    };
    set((s) => ({ metrics: { ...s.metrics, [source]: next } }));

    const cycles = next.success + next.failure;
    const context = {
      source,
      latencyMs: next.lastLatencyMs,
      avgLatencyMs: next.avgLatencyMs,
      failureRate: cycles ? Number((next.failure / cycles).toFixed(3)) : 0,
      cycles,
      ...(extra ?? {}),
    };
    if (failed) logger.warn(`[poll:${source}] ciclo falhou`, { ...context, error: next.lastError });
    else logger.debug(`[poll:${source}] ciclo ok`, context);
  },
}));

/** Helper: mede um ciclo de polling e registra a métrica automaticamente. */
export async function trackPoll<T>(
  source: PollSource,
  fn: () => Promise<T>,
  extra?: (result: T) => Record<string, unknown>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    usePollMetricsStore
      .getState()
      .record(source, Date.now() - started, undefined, extra ? extra(result) : undefined);
    return result;
  } catch (err) {
    usePollMetricsStore.getState().record(source, Date.now() - started, err ?? new Error("erro desconhecido"));
    throw err;
  }
}

export function selectPollMetrics(source: PollSource) {
  return (s: MetricsState) => s.metrics[source];
}
