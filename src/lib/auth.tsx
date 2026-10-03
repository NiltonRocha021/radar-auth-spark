import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

function getCurrentProjectLegacyStorageKey(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) return null;

  try {
    const hostname = new URL(url).hostname;
    const projectRef = hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)?.[1];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

function readLegacyStoredSession(): { access_token: string; refresh_token: string } | null {
  try {
    const key = getCurrentProjectLegacyStorageKey();
    if (!key) return null;

    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

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
  } catch {
    // Storage legado inválido ou indisponível: o fluxo normal de login segue.
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;
    let sawEvent = false;

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      sawEvent = true;
      if (_e === "SIGNED_OUT") queryClient.clear();
      setSession(s);
      setLoading(false);
    });

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        if (data.session) {
          if (!sawEvent) setSession(data.session);
          setLoading(false);
          return;
        }

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

    const refreshIfStale = async () => {
      const { data } = await supabase.auth.getSession();
      const expiresAt = data.session?.expires_at ?? 0;
      const now = Math.floor(Date.now() / 1000);
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
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
