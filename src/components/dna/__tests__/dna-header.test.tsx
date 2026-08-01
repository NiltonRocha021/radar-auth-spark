// Cenários de render do DnaHeader: dados reais vindos de `useDnaProfile`
// (badge "ao vivo" + valores do backend) e fallback demo (badge "demo" +
// valores de `GAUGES`).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { GAUGES } from "@/lib/dna-data";

// framer-motion: substituímos por elementos simples para evitar animações
// e requisições de layout no jsdom.
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_t, tag: string) => {
        const C = ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => {
          const clean = { ...props };
          delete clean.initial;
          delete clean.animate;
          delete clean.transition;
          delete clean.whileHover;
          delete clean.exit;
          return require("react").createElement(tag, clean, children);
        };
        return C;
      },
    },
  ),
}));

const dnaState: { data: unknown } = { data: undefined };
const authState: { session: unknown } = { session: { user: { id: "u1" } } };

vi.mock("@/hooks/useDnaProfile", () => ({
  useDnaProfile: () => dnaState,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => authState,
}));

let DnaHeader: typeof import("../dna-header").DnaHeader;

beforeEach(async () => {
  const mod = await import("../dna-header");
  DnaHeader = mod.DnaHeader;
  dnaState.data = undefined;
  authState.session = { user: { id: "u1" } };
});

describe("DnaHeader — fallback demo", () => {
  it("sem dados do backend, mostra badge 'demo' e os valores de GAUGES", () => {
    render(<DnaHeader />);
    expect(screen.getByText("demo")).toBeTruthy();
    expect(screen.queryByText("ao vivo")).toBeNull();
    expect(
      screen.getByText(`Consistency ring · ${GAUGES[0].value}% filled`),
    ).toBeTruthy();
  });

  it("DTO sem sub-métricas (data vazio) continua em demo", () => {
    dnaState.data = { userId: "u1", data: {} };
    render(<DnaHeader />);
    expect(screen.getByText("demo")).toBeTruthy();
  });

  it("sem sessão o componente ainda renderiza (não quebra)", () => {
    authState.session = null;
    render(<DnaHeader />);
    expect(screen.getByText("MOMENTUM TRADER")).toBeTruthy();
    expect(screen.getByText("demo")).toBeTruthy();
  });
});

describe("DnaHeader — dados reais", () => {
  it("com dnaConsistency presente, mostra badge 'ao vivo' e o valor real", () => {
    dnaState.data = {
      userId: "u1",
      dnaConsistency: 42,
      dnaDiscipline: 51,
      dnaRiskControl: 63,
      dnaTiming: 74,
      dnaEmotionalControl: 85,
    };
    render(<DnaHeader />);
    expect(screen.getByText("ao vivo")).toBeTruthy();
    expect(screen.queryByText("demo")).toBeNull();
    expect(screen.getByText("Consistency ring · 42% filled")).toBeTruthy();
  });

  it("arredonda valores fracionários vindos do backend", () => {
    dnaState.data = { userId: "u1", dnaConsistency: 42.6 };
    render(<DnaHeader />);
    expect(screen.getByText("Consistency ring · 43% filled")).toBeTruthy();
  });

  it("preenche com o valor demo apenas as métricas ausentes no payload real", () => {
    dnaState.data = { userId: "u1", dnaConsistency: 90 };
    render(<DnaHeader />);
    // Continua "ao vivo" mesmo com sub-métricas faltando.
    expect(screen.getByText("ao vivo")).toBeTruthy();
    expect(screen.getByText("Consistency ring · 90% filled")).toBeTruthy();
    // Todos os 5 gauges seguem renderizados.
    for (const g of GAUGES) {
      expect(screen.getByText(g.label)).toBeTruthy();
    }
  });
});
