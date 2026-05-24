import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { BrandLogo } from "@/components/brand-logo";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-background bg-dot-grid">
      <header className="px-6 py-5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
          <BrandLogo size={36} />
          <div className="flex flex-col leading-tight">
            <span className="text-base font-medium">AISignalRadar</span>
            <span className="text-[11px] text-muted-foreground">Dashboard</span>
          </div>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-medium">Welcome{user?.email ? `, ${user.email}` : ""}.</h1>
        <p className="text-muted-foreground mt-2">Your trading intelligence dashboard is being prepared.</p>
      </main>
    </div>
  );
}
