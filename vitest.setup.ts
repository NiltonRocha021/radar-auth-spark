// Vitest global setup — mocks shared por todos os testes.
import { vi, afterEach } from "vitest";

// Mock global do cliente Supabase: stores e helpers o importam no top-level
// e disparam chamadas de rede (getSession/onAuthStateChange) ao montar o módulo.
// Sem este mock os testes ficariam dependentes da rede e do .env.
vi.mock("@/integrations/supabase/client", () => {
  const listeners = new Set<(event: string, session: unknown) => void>();
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
      listeners.add(cb);
      return {
        data: {
          subscription: {
            unsubscribe: () => listeners.delete(cb),
          },
        },
      };
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    // Helper exposto para os testes dispararem eventos manualmente.
    _emit: (event: string, session: unknown) => listeners.forEach((cb) => cb(event, session)),
  };
  return {
    supabase: {
      auth,
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: undefined,
      })),
    },
  };
});

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
  // Limpa localStorage entre testes para isolar persist do zustand.
  if (typeof localStorage !== "undefined") localStorage.clear();
});
