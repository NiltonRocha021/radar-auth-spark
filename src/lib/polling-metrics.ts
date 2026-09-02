// Métricas de polling — instrumentação leve para diagnosticar LIVE.
//
// Cada fonte de polling (sinais, bot) registra início/fim de cada ciclo.
// Guardamos latência (última + média móvel), contagem de sucessos/falhas,
// timestamps da última atualização, uma janela dos últimos N ciclos (para
// taxa de falha recente) e os últimos erros estruturados. Também emitimos log
// estruturado a cada ciclo (warn em falha, debug em sucesso).
import { create } from "zustand";
import { logger } from "./logger";

export type PollSource = "signals" | "bot4x";

/** Tamanho da janela usada para calcular a taxa de falha recente. */
export const RECENT_WINDOW = 10;
/** Acima deste limiar (janela recente) a UI mostra alerta de degradação. */
export const FAILURE_ALERT_THRESHOLD = 0.4;
/** Mínimo de ciclos na janela antes de alertar (evita alarme falso). */
export const MIN_CYCLES_FOR_ALERT = 3;

export interface PollErrorEntry {
  at: number;
  message: string;
  latencyMs: number;
  context?: Record<string, unknown>;
}

export interface PollMetrics {
  source: PollSource;
  lastLatencyMs: number | null;
  avgLatencyMs: number | null;
  success: number;
  failure: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  /** Últimos ciclos (true = falha), mais recente no fim. */
  recent: boolean[];
  /** Falhas consecutivas — dirige o backoff exponencial. */
  consecutiveFailures: number;
  /** Últimos erros estruturados (mais recente primeiro, máx. 5). */
  errors: PollErrorEntry[];
  /** Quando o próximo retry com backoff está agendado (null = sem backoff). */
  nextRetryAt: number | null;
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
    recent: [],
    consecutiveFailures: 0,
    errors: [],
    nextRetryAt: null,
  };
}

type MetricsState = {
  metrics: Record<PollSource, PollMetrics>;
  record: (source: PollSource, latencyMs: number, error?: unknown, extra?: Record<string, unknown>) => void;
  setNextRetryAt: (source: PollSource, at: number | null) => void;
  reset: (source: PollSource) => void;
};

export const usePollMetricsStore = create<MetricsState>((set, get) => ({
  metrics: { signals: emptyMetrics("signals"), bot4x: emptyMetrics("bot4x") },
  reset: (source) =>
    set((s) => ({ metrics: { ...s.metrics, [source]: emptyMetrics(source) } })),
  setNextRetryAt: (source, at) =>
    set((s) => ({
      metrics: { ...s.metrics, [source]: { ...(s.metrics[source] ?? emptyMetrics(source)), nextRetryAt: at } },
    })),
  record: (source, latencyMs, error, extra) => {
    const prev = get().metrics[source] ?? emptyMetrics(source);
    const failed = error !== undefined && error !== null;
    const total = prev.success + prev.failure;
    const avg =
      prev.avgLatencyMs === null ? latencyMs : (prev.avgLatencyMs * total + latencyMs) / (total + 1);
    const message = failed ? (error instanceof Error ? error.message : String(error)) : null;

    const next: PollMetrics = {
      source,
      lastLatencyMs: Math.round(latencyMs),
      avgLatencyMs: Math.round(avg),
      success: prev.success + (failed ? 0 : 1),
      failure: prev.failure + (failed ? 1 : 0),
      lastSuccessAt: failed ? prev.lastSuccessAt : Date.now(),
      lastFailureAt: failed ? Date.now() : prev.lastFailureAt,
      lastError: message,
      recent: [...prev.recent, failed].slice(-RECENT_WINDOW),
      consecutiveFailures: failed ? prev.consecutiveFailures + 1 : 0,
      errors: failed
        ? [
            { at: Date.now(), message: message ?? "erro desconhecido", latencyMs: Math.round(latencyMs), context: extra },
            ...prev.errors,
          ].slice(0, 5)
        : prev.errors,
      nextRetryAt: failed ? prev.nextRetryAt : null,
    };
    set((s) => ({ metrics: { ...s.metrics, [source]: next } }));

    const cycles = next.success + next.failure;
    const context = {
      source,
      latencyMs: next.lastLatencyMs,
      avgLatencyMs: next.avgLatencyMs,
      failureRate: cycles ? Number((next.failure / cycles).toFixed(3)) : 0,
      recentFailureRate: recentFailureRate(next),
      consecutiveFailures: next.consecutiveFailures,
      cycles,
      ...(extra ?? {}),
    };
    if (failed) logger.warn(`[poll:${source}] ciclo falhou`, { ...context, error: next.lastError });
    else logger.debug(`[poll:${source}] ciclo ok`, context);
  },
}));

/** Taxa de falha na janela recente (0..1). */
export function recentFailureRate(m: PollMetrics): number {
  if (!m.recent.length) return 0;
  const fails = m.recent.filter(Boolean).length;
  return Number((fails / m.recent.length).toFixed(3));
}

/** true quando a janela recente ultrapassa o limiar de degradação. */
export function isDegraded(m: PollMetrics): boolean {
  return m.recent.length >= MIN_CYCLES_FOR_ALERT && recentFailureRate(m) > FAILURE_ALERT_THRESHOLD;
}

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

// ── Retry com backoff exponencial + jitter ────────────────────────────────
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;
export const MAX_RETRIES = 4;

/** Delay do retry #attempt (1-based) com jitter full (0..delay). */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
  // jitter "full": metade fixa + metade aleatória, evita thundering herd
  return Math.round(exp / 2 + random() * (exp / 2));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Executa um ciclo de polling com retries em backoff exponencial + jitter.
 * Cada tentativa é medida por trackPoll. Se todas falharem, lança o último
 * erro para que a store caia no estado de erro amigável.
 */
export async function pollWithRetry<T>(
  source: PollSource,
  fn: () => Promise<T>,
  opts?: { maxRetries?: number; extra?: (result: T) => Record<string, unknown>; random?: () => number },
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? MAX_RETRIES;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const out = await trackPoll(source, fn, opts?.extra);
      usePollMetricsStore.getState().setNextRetryAt(source, null);
      return out;
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;
      const delay = backoffDelay(attempt + 1, opts?.random);
      usePollMetricsStore.getState().setNextRetryAt(source, Date.now() + delay);
      await sleep(delay);
    }
  }
  usePollMetricsStore.getState().setNextRetryAt(source, null);
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function selectPollMetrics(source: PollSource) {
  return (s: MetricsState) => s.metrics[source];
}
