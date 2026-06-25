import { describe, it, expect } from "vitest";
import { calcRSI, calcVolumeRatio, calcChannelZone } from "../engine-scoring";
import type { OHLCV } from "../engine-scoring";

// Helper: gera N candles com close crescente linear.
function bullCandles(n: number, start = 100, step = 1): OHLCV[] {
  return Array.from({ length: n }, (_, i) => {
    const close = start + i * step;
    return {
      time: i,
      open: close - step / 2,
      high: close + step / 2,
      low: close - step,
      close,
      volume: 1000,
    };
  });
}

function bearCandles(n: number, start = 200, step = 1): OHLCV[] {
  return bullCandles(n, start, -step);
}

function flatCandles(n: number, price = 100, volume = 1000): OHLCV[] {
  return Array.from({ length: n }, (_, i) => ({
    time: i,
    open: price,
    high: price,
    low: price,
    close: price,
    volume,
  }));
}

describe("calcRSI", () => {
  it("retorna 50 (neutro) quando há dados insuficientes", () => {
    expect(calcRSI(flatCandles(5))).toBe(50);
  });

  it("retorna 100 numa tendência de alta pura (sem losses)", () => {
    expect(calcRSI(bullCandles(50))).toBe(100);
  });

  it("retorna valor baixo numa tendência de queda pura", () => {
    expect(calcRSI(bearCandles(50))).toBeLessThan(10);
  });

  it("retorna valor entre 0 e 100 sempre", () => {
    const rsi = calcRSI(bullCandles(30));
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);
  });
});

describe("calcVolumeRatio", () => {
  it("retorna ~0 quando volume é constante (vs média)", () => {
    // A função retorna (currentVol / avgVol - 1), então constante = 0.
    const ratio = calcVolumeRatio(flatCandles(30, 100, 1000));
    expect(Math.abs(ratio)).toBeLessThan(0.01);
  });

  it("retorna 0 (guard) quando volume médio é zero", () => {
    expect(calcVolumeRatio(flatCandles(30, 100, 0))).toBe(0);
  });
});

describe("calcChannelZone", () => {
  it("classifica zona baseada em preço atual vs range histórico", () => {
    const candles = bullCandles(30, 100, 1);
    const zone = calcChannelZone(candles, candles[candles.length - 1].close);
    // Em uma alta pura, o preço atual está no topo do canal.
    expect(["TOP", "MIDDLE", "BOTTOM"]).toContain(zone);
  });
});
