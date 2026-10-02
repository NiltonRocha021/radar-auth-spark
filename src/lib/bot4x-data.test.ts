import { describe, expect, it } from "vitest";
import { analyzeCandles, makeTick, PROFILES } from "./bot4x-data";
import type { Candle } from "./market-data";

function candles(): Candle[] {
  return Array.from({ length: 80 }, (_, i) => {
    const close = 100 + i * 0.8;
    return {
      openTime: i * 300000,
      open: close - 0.2,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000 + (i % 5) * 100,
      closeTime: i * 300000 + 299999,
    };
  });
}

describe("Bot4x real market analysis", () => {
  it("produces deterministic indicators from the same real candle set", () => {
    const data = candles();
    expect(analyzeCandles("BTCUSDT", "5m", data)).toEqual(
      analyzeCandles("BTCUSDT", "5m", data),
    );
  });

  it("uses the latest candle close as the analysis price", () => {
    const result = analyzeCandles("BTCUSDT", "5m", candles());
    expect(result.price).toBe(163.2);
    expect(result.pair).toBe("BTC/USDT");
    expect(Number.isFinite(result.rsi)).toBe(true);
    expect(Number.isFinite(result.aiScore)).toBe(true);
  });

  it("does not allow a tick without a real market analysis", () => {
    expect(() =>
      makeTick({ profile: PROFILES.conservador, slotsUsed: 0 }),
    ).toThrow("análise real de mercado");
  });
});
