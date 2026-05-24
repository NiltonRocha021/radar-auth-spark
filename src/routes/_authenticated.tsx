import { createFileRoute, useNavigate, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Bot4xFloatingWidget } from "@/components/bot4x/floating-widget";
import { Bot4xGlobalNotifier } from "@/components/global/bot4x-notifier";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { useBot4xStore } from "@/lib/bot4x-store";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

function AuthGate() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // Ensure bot4x store is initialized globally so widgets/notifier always have data
  const initBot4x = useBot4xStore((s) => s.init);
  useEffect(() => { initBot4x(); }, [initBot4x]);

  return (
    <>
      <Outlet />
      <Bot4xFloatingWidget />
      <MobileBottomNav />
      <Bot4xGlobalNotifier />
    </>
  );
}
