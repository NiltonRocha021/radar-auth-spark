import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthCtx>({ session: null, user: null, loading: true });

type LegacyStoredSession = {
  access_token?: unknown;
  refresh_token?: unknown;
  currentSession?: LegacyStoredSession;
};

function readLegacyStoredSession(): { access_token: string; refresh_token: string } | null {
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as LegacyStoredSession;
      const candidate = parsed.currentSession ?? parsed;
      if (
        typeof candidate.access_token === "string" &&
        typeof candidate.refresh_token === "string"
      ) {
        return {
          access_token: candidate.access_token,
          refresh_token: candidate.refresh_token,
        };
      }
    }
  } catch {
    // Storage legado inválido ou indisponível: o fluxo normal de login segue.
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Um evento do listener é sempre mais recente que o snapshot do
    // getSession() em voo — sem esta flag, um SIGNED_IN que chega antes do
    // getSession resolver era sobrescrito por `null` (usuário "deslogava"
    // sozinho logo após entrar).
    let sawEvent = false;

    // 1) Subscreve PRIMEIRO para não perder eventos disparados durante a
    //    hidratação inicial (SIGNED_IN logo após restore do localStorage,
    //    TOKEN_REFRESHED enquanto getSession ainda resolve, etc.).
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      sawEvent = true;
      setSession(s);
      setLoading(false);
    });

    // 2) Hidrata sincronamente a partir do storage. Sem isso, no F5 a UI
    //    fica em loading até o INITIAL_SESSION chegar (race que aparecia
    //    como "tela em branco" ao recarregar).
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        if (data.session) {
          if (!sawEvent) setSession(data.session);
          setLoading(false);
          return;
        }

        // Migração única para usuários que já estavam autenticados antes da
        // troca do storage de localStorage para cookies com @supabase/ssr.
        // Sem isso, a sessão continuava válida no navegador, mas a tela de
        // login não a enxergava e nunca entrava no sistema.
        const legacySession = readLegacyStoredSession();
        if (legacySession) {
          const { data: migrated, error } = await supabase.auth.setSession(legacySession);
          if (!mounted) return;
          if (!error && migrated.session && !sawEvent) {
            setSession(migrated.session);
          }
        } else if (!sawEvent) {
          setSession(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
      });


    // 3) Garante refresh do token quando a aba volta a ficar visível ou
    //    a rede reconecta — evita 401 silencioso após sleep / suspensão
    //    do navegador, que também causava tela vazia até o próximo evento.
    const refreshIfStale = async () => {
      const { data } = await supabase.auth.getSession();
      const expiresAt = data.session?.expires_at ?? 0;
      const now = Math.floor(Date.now() / 1000);
      // Refresh proativo se faltar menos de 60s para expirar.
      if (data.session && expiresAt - now < 60) {
        await supabase.auth.refreshSession();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshIfStale();
    };
    const onOnline = () => void refreshIfStale();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
