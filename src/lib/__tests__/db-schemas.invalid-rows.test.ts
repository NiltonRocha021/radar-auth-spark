// Injeta linhas inválidas "vindas do banco" e confirma que a validação Zod
// descarta apenas as ruins, mantém as boas e emite log estruturado.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger } from "../logger";
import {
  signalRowSchema,
  manipulationAlertRowSchema,
  usableOhlcvSchema,
  parseRows,
  parseRow,
} from "../db-schemas";

describe("db-schemas — descarte de linhas inválidas", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("mantém a linha válida e descarta as inválidas de signals", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const rows: unknown[] = [
      { id: "sig-1", pair: "BTCUSDT", side: "BUY", score: "82", entry_price: 100, created_at: "2026-01-01" },
      { id: "", pair: "ETHUSDT" }, // id vazio → inválida
      null, // linha nula → inválida
      { pair: "SOLUSDT", score: 10 }, // sem id → inválida
      { id: "sig-2", entry_price: "não-numérico" }, // número inválido vira null, linha válida
    ];

    const ok = parseRows(signalRowSchema, rows, "test.signals");

    expect(ok.map((r) => r.id)).toEqual(["sig-1", "sig-2"]);
    expect(ok[0].score).toBe(82); // string numérica coagida
    expect(ok[1].entry_price).toBeNull(); // valor sujo neutralizado, não NaN
    expect(ok.every((r) => !Number.isNaN(r.score ?? 0))).toBe(true);

    expect(warn).toHaveBeenCalledTimes(1);
    const [msg, ctx] = warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(msg).toContain("[db-validation]");
    expect(ctx).toMatchObject({ source: "test.signals", dropped: 3, total: 5 });
    expect(Array.isArray(ctx.samples)).toBe(true);
  });

  it("descarta alertas de manipulação sem campos obrigatórios", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const ok = parseRows(
      manipulationAlertRowSchema,
      [
        { id: "a1", symbol: "BTCUSDT", alert_type: "spoofing", severity: "HIGH" },
        { id: "a2", symbol: "", alert_type: "spoofing", severity: "HIGH" },
        { id: "a3", symbol: "ETHUSDT" },
      ],
      "test.manipulation",
    );
    expect(ok).toHaveLength(1);
    expect(ok[0].id).toBe("a1");
    expect(warn).toHaveBeenCalled();
  });

  it("descarta velas incoerentes (high < low) antes de indicadores", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const ok = parseRows(
      usableOhlcvSchema,
      [
        { open_time: 1, high: 10, low: 8, close: 9 },
        { open_time: 2, high: 5, low: 9, close: 7 }, // high < low
        { open_time: 3, high: null, low: 1, close: 2 }, // incompleta
      ],
      "test.ohlcv",
    );
    expect(ok).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });

  it("parseRow devolve null e loga quando a linha única é inválida", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    expect(parseRow(signalRowSchema, { pair: "BTCUSDT" }, "test.single")).toBeNull();
    expect(parseRow(signalRowSchema, null, "test.single")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("nunca lança com entradas degeneradas", () => {
    expect(() => parseRows(signalRowSchema, null, "t")).not.toThrow();
    expect(parseRows(signalRowSchema, [], "t")).toEqual([]);
    expect(parseRows(signalRowSchema, [undefined, 42, "x"], "t")).toEqual([]);
  });
});
