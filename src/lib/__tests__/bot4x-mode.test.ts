import { describe, it, expect } from "vitest";
import { getEffectiveMode } from "../bot4x-store";

describe("getEffectiveMode (Bot4x)", () => {
  it("respeita o modo REAL persistido e validado no servidor", () => {
    expect(getEffectiveMode("REAL")).toBe("REAL");
  });

  it("respeita DEMO em qualquer combinação", () => {
    expect(getEffectiveMode("DEMO")).toBe("DEMO");
  });
});
