// TODO: MIGRAÇÃO — este hook inteiro é removido na Fase 6, quando não sobrar
// consumidor de backend externo (NestJS) neste projeto.
// Hoje ele só expõe { userId, ready } a partir da sessão Supabase local.
// Não faz mais round-trip para /auth/me — o backend NestJS deixa de ser
// fonte de verdade de identidade nesta fase-ponte.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useBackendAuth() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = async () => {
      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user?.id ?? null);
      setReady(true);
    };
    sync();
    const { data: listener } = supabase.auth.onAuthStateChange(() => sync());
    return () => listener.subscription.unsubscribe();
  }, []);

  return { userId, ready };
}
