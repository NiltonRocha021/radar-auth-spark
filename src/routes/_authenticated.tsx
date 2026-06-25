import { createFileRoute, useNavigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useEffect, useState, lazy, Suspense } from "react";
import { Bot4xCompactPill } from "@/components/global/bot4x-compact-pill";
import { Bot4xGlobalNotifier } from "@/components/global/bot4x-notifier";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { TourController } from "@/components/tour/tour-controller";
import { useBot4xStore } from "@/lib/bot4x-store";
import { useDnaAutoCorrector } from "@/lib/dna-auto-corrector";
import { useTraderProfile } from "@/hooks/useTraderProfile";
import { useMarketContext } from "@/hooks/useMarketContext";
import { useCopilotUI } from "@/lib/copilot-ui-store";
import { useStoreCleanup } from "@/hooks/useStoreCleanup";
import { Skeleton } from "@/components/ui/skeleton";


// PERF-01: code-split widgets pesados. CopilotPanel só monta após o
// usuário interagir com o Copilot (useCopilotUI.open).
const Bot4xFloatingWidget = lazy(() =>
  import("@/components/bot4x/floating-widget").then((m) => ({ default: m.Bot4xFloatingWidget })),
);
const CopilotPanel = lazy(() =>
  import("@/components/copilot/CopilotPanel").then((m) => ({ default: m.CopilotPanel })),
);

export const Route = createFileRoute("/_authenticated")({
  // SEG-01: proteção 100% client-side (AuthGate). Veja docs/architecture/
  // backend-boundary.md e .lovable/plan.md para o motivo de não migrarmos
  // para SSR de sessão neste momento (client.ts é auto-gerado).
  component: AuthGate,
});

function AuthGate() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const copilotOpen = useCopilotUI((s) => s.open);
  // Uma vez aberto, mantenha montado para preservar estado/conversa.
  const [copilotEverOpened, setCopilotEverOpened] = useState(false);
  useEffect(() => {
    if (copilotOpen) setCopilotEverOpened(true);
  }, [copilotOpen]);

  // PERF-01: só busca perfil/contexto de mercado quando o Copilot está
  // (ou já foi) aberto — evita canal Realtime e fetch desnecessários em
  // toda rota autenticada.
  const copilotActive = copilotEverOpened;
  const { profile } = useTraderProfile(copilotActive ? session?.user?.id : undefined);
  const { marketContext } = useMarketContext(copilotActive ? session?.user?.id : undefined);

  const initBot4x = useBot4xStore((s) => s.init);
  useDnaAutoCorrector(!!session);
  useStoreCleanup();


  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (session) initBot4x();
  }, [session, initBot4x]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "b" && e.key !== "B") return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
      if (target.closest("[contenteditable='true']")) return;
      e.preventDefault();
      navigate({ to: "/bot4x" });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate]);

  if (loading || !session) {
    // UX-01: skeleton que aproxima o shell (sidebar + topbar + conteúdo)
    // em vez de spinner de tela cheia — reduz CLS e flash visual.
    return (
      <div className="min-h-screen flex bg-background">
        <div className="hidden lg:block w-60 border-r border-border/40 p-4 space-y-3">
          <Skeleton className="h-8 w-32" />
          <div className="space-y-2 pt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col">
          <div className="h-14 border-b border-border/40 px-4 flex items-center justify-between">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-64" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Outlet />
      <Suspense fallback={null}>
        <Bot4xFloatingWidget />
      </Suspense>
      <Bot4xCompactPill />
      <MobileBottomNav />
      <Bot4xGlobalNotifier />
      <TourController />
      {copilotEverOpened && (
        <Suspense fallback={null}>
          <CopilotPanel
            userId={session.user.id}
            token={session.access_token}
            mode="float"
            traderProfile={profile}
            marketContext={marketContext}
          />
        </Suspense>
      )}
    </>
  );
}
