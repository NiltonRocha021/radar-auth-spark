// Métricas de polling: janela recente, alerta de degradação, backoff+jitter
// e fallback para erro quando as tentativas se esgotam.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  usePollMetricsStore,
  trackPoll,
  pollWithRetry,
  backoffDelay,
  recentFailureRate,
  isDegraded,
  RECENT_WINDOW,
  BACKOFF_MAX_MS,
} from "../polling-metrics";

const get = () => usePollMetricsStore.getState().metrics.signals;

describe("polling-metrics", () => {
  beforeEach(() => {
    usePollMetricsStore.getState().reset("signals");
    usePollMetricsStore.getState().reset("bot4x");
  });
  afterEach(() => vi.useRealTimers());

  it("registra sucesso e falha com erro estruturado", async () => {
    await trackPoll("signals", async () => 1);
    await expect(trackPoll("signals", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    const m = get();
    expect(m.success).toBe(1);
    expect(m.failure).toBe(1);
    expect(m.lastError).toBe("boom");
    expect(m.errors[0]).toMatchObject({ message: "boom" });
    expect(m.consecutiveFailures).toBe(1);
  });

  it("limita a janela recente a RECENT_WINDOW ciclos", async () => {
    for (let i = 0; i < RECENT_WINDOW + 5; i++) await trackPoll("signals", async () => i);
    expect(get().recent).toHaveLength(RECENT_WINDOW);
    expect(recentFailureRate(get())).toBe(0);
    expect(isDegraded(get())).toBe(false);
  });

  it("marca degradado quando a taxa de falha recente ultrapassa o limiar", async () => {
    for (let i = 0; i < 4; i++) {
      await trackPoll("signals", async () => Promise.reject(new Error("x"))).catch(() => {});
    }
    expect(recentFailureRate(get())).toBe(1);
    expect(isDegraded(get())).toBe(true);
  });

  it("backoff cresce exponencialmente, tem jitter e respeita o teto", () => {
    expect(backoffDelay(1, () => 0)).toBe(500);
    expect(backoffDelay(1, () => 1)).toBe(1000);
    expect(backoffDelay(3, () => 0)).toBe(2000);
    expect(backoffDelay(30, () => 1)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(2, () => 0)).toBeLessThan(backoffDelay(4, () => 0));
  });

  it("pollWithRetry tenta novamente e devolve o valor após falha transitória", async () => {
    let calls = 0;
    const out = await pollWithRetry(
      "signals",
      async () => {
        calls++;
        if (calls < 3) throw new Error("transitório");
        return "ok";
      },
      { maxRetries: 3, random: () => 0 },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(3);
    expect(get().success).toBe(1);
    expect(get().failure).toBe(2);
    expect(get().nextRetryAt).toBeNull();
  });

  it("propaga o erro após esgotar as tentativas (fallback para estado de erro)", async () => {
    await expect(
      pollWithRetry("signals", async () => Promise.reject(new Error("offline")), {
        maxRetries: 2,
        random: () => 0,
      }),
    ).rejects.toThrow("offline");
    expect(get().failure).toBe(3);
    expect(get().nextRetryAt).toBeNull();
    expect(isDegraded(get())).toBe(true);
  });
});
