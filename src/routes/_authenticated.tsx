import { createFileRoute, useNavigate, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Bot4xFloatingWidget } from "@/components/bot4x/floating-widget";
import { Bot4xCompactPill } from "@/components/global/bot4x-compact-pill";
import { Bot4xGlobalNotifier } from "@/components/global/bot4x-notifier";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { TourController } from "@/components/tour/tour-controller";
import { useBot4xStore } from "@/lib/bot4x-store";
import { useDnaAutoCorrector } from "@/lib/dna-auto-corrector";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { useTraderProfile } from "@/hooks/useTraderProfile";
import { useMarketContext } from "@/hooks/useMarketContext";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

function AuthGate() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { profile } = useTraderProfile(session?.user?.id);
  const { marketContext } = useMarketContext(session?.user?.id);
  const initBot4x = useBot4xStore((s) => s.init);
  useDnaAutoCorrector(!!session);

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <Outlet />
      <Bot4xFloatingWidget />
      <Bot4xCompactPill />
      <MobileBottomNav />
      <Bot4xGlobalNotifier />
      <TourController />
      <CopilotPanel
        userId={session.user.id}
        token={session.access_token}
        mode="float"
        traderProfile={profile}
        marketContext={marketContext}
      />
    </>
  );
}
