import { LayoutDashboard, Activity, Radar, Bell, Brain, Settings, Cpu, User, Sparkles, Tag, Code2, Users, Store } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";

const items = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard" as const },
  { icon: Activity, label: "Signals", to: "/signals" as const },
  { icon: Cpu, label: "Bot4x", to: "/bot4x" as const },
  { icon: Radar, label: "Manipulation", to: "/manipulation" as const },
  { icon: Sparkles, label: "Sentiment", to: "/sentiment" as const },
  { icon: Brain, label: "DNA", to: "/dna-trader" as const },
  { icon: Users, label: "Copy", to: "/copy-trading" as const },
  { icon: Store, label: "Marketplace", to: "/marketplace" as const },
  { icon: Bell, label: "Alerts", to: "/alerts" as const },
  { icon: Code2, label: "API", to: "/api" as const },
  { icon: Tag, label: "Pricing", to: "/pricing" as const },
  { icon: User, label: "Profile", to: "/profile" as const },
];

export function LeftSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="w-16 shrink-0 border-r border-border bg-card/40 flex flex-col items-center py-3 gap-2 sticky top-12 self-start h-[calc(100vh-3rem)]">
      <div className="mb-2">
        <BrandLogo size={36} />
      </div>
      {items.map((it) => {
        const active = path === it.to;
        return (
          <Link
            key={it.label}
            to={it.to}
            title={it.label}
            className={`group relative size-10 rounded-lg flex items-center justify-center transition-colors ${
              active ? "bg-[var(--brand-blue-deep)] text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <it.icon className="size-[18px]" />
            {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-[var(--brand-cyan)]" />}
          </Link>
        );
      })}
      <div className="mt-auto">
        <Link
          to="/settings"
          title="Settings"
          className={`size-10 rounded-lg flex items-center justify-center transition-colors ${
            path === "/settings" ? "bg-[var(--brand-blue-deep)] text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <Settings className="size-[18px]" />
        </Link>
      </div>
    </aside>
  );
}
