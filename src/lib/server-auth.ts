// Server-side auth probe.
// Ordem de resolução:
//   1. Cookie de sessão (@supabase/ssr) — usado no SSR inicial / navegação
//      direta a rota protegida (refresh, deep link).
//   2. Bearer no Authorization header — usado em chamadas de server function
//      client-side (functionMiddleware anexa o token).
// Retorna DTO plano; nunca lança (probe defensivo).
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getServerSession } from "@/integrations/supabase/server-session";

export type AuthSession =
  | { isAuthenticated: true; userId: string }
  | { isAuthenticated: false; userId?: undefined };

export const getAuthSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthSession> => {
    try {
      // 1) Cookie SSR (@supabase/ssr).
      const cookieSession = await getServerSession();
      if (cookieSession) {
        return { isAuthenticated: true, userId: cookieSession.userId };
      }

      // 2) Bearer token (chamadas de server fn client-side).
      const SUPABASE_URL = process.env.SUPABASE_URL;
      const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
      if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        return { isAuthenticated: false };
      }

      const request = getRequest();
      const authHeader = request?.headers?.get("authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return { isAuthenticated: false };
      }

      const token = authHeader.slice("Bearer ".length);
      if (!token) return { isAuthenticated: false };

      const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      });

      const { data, error } = await supabase.auth.getClaims(token);
      if (error || !data?.claims?.sub) return { isAuthenticated: false };

      return { isAuthenticated: true, userId: String(data.claims.sub) };
    } catch {
      return { isAuthenticated: false };
    }
  },
);
