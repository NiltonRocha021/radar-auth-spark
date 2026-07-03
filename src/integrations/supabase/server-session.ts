// Server-side Supabase client backed by request cookies.
// Usa @supabase/ssr para ler a sessão persistida em cookie pelo
// createBrowserClient em src/integrations/supabase/client.ts.
//
// Deve ser chamado APENAS dentro de handlers de server functions ou
// server routes (usa AsyncLocalStorage via getRequest/setCookie).
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  getRequest,
  getCookie,
  setCookie,
  getCookies,
} from "@tanstack/react-start/server";
import type { Database } from "./types";

export function getServerSupabase() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Missing Supabase env: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY",
    );
  }

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        const all = getCookies();
        return Object.entries(all ?? {}).map(([name, value]) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(name, value, options as CookieOptions);
        }
      },
    },
  });
}

/**
 * Resolve a sessão server-side lendo o cookie da requisição atual.
 * Retorna { userId } quando autenticado, ou null.
 * Não lança — falhas de rede/env viram null e o AuthGate client cobre.
 */
export async function getServerSession(): Promise<{ userId: string } | null> {
  try {
    // Sem cookies na requisição -> não há sessão possível; evita fetch desnecessário.
    const req = getRequest();
    const cookieHeader = req?.headers?.get("cookie");
    if (!cookieHeader) return null;

    const supabase = getServerSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { userId: data.user.id };
  } catch {
    return null;
  }
}

export { getCookie };
