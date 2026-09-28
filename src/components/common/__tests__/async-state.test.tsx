// Garante que a UI degrada para loading/empty/error sem quebrar a renderização
// quando o banco devolve linhas inválidas (todas descartadas pelo Zod).
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AsyncState } from "../async-state";
import { signalRowSchema, parseRows } from "@/lib/db-schemas";
import { logger } from "@/lib/logger";

function Screen({ rows, isLoading, error }: { rows?: unknown[]; isLoading?: boolean; error?: unknown }) {
  const parsed = parseRows(signalRowSchema, rows, "ui.test");
  return (
    <AsyncState isLoading={isLoading} error={error} isEmpty={parsed.length === 0}>
      <ul>
        {parsed.map((r) => (
          <li key={r.id}>{r.pair}</li>
        ))}
      </ul>
    </AsyncState>
  );
}

describe("AsyncState com dados inválidos do banco", () => {
  it("mostra loading sem quebrar", () => {
    render(<Screen isLoading rows={[]} />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("cai em empty quando todas as linhas são descartadas pelo Zod", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    expect(() => render(<Screen rows={[{ id: "" }, null, { pair: "BTC" }]} />)).not.toThrow();
    expect(screen.getByText(/Nada por aqui ainda/i)).toBeTruthy();
  });

  it("renderiza apenas as linhas válidas", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    render(<Screen rows={[{ id: "1", pair: "BTCUSDT" }, { id: "" }]} />);
    expect(screen.getByText("BTCUSDT")).toBeTruthy();
  });

  it("mostra o estado de erro amigável quando o polling falha", () => {
    render(<Screen rows={[]} error={new Error("falha de rede")} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Não foi possível carregar/i)).toBeTruthy();
  });
});
