// Vitest global setup — apenas mocks que não dependem de spies expostos
// para os testes (esses devem viver no próprio test file via vi.mock).
import { vi, afterEach } from "vitest";

// `sonner` toast — usado pelo dna-auto-corrector; evita console noise.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  },
}));

afterEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
});
