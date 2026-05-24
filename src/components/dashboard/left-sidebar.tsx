import { LayoutDashboard, Activity, Flame, Bell, Calendar, Brain, BarChart3, Settings } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

const items = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Activity, label: "Signals" },
  { icon: Flame, label: "Heatmap" },
  { icon: BarChart3, label: "Performance" },
  { icon: Brain, label: "DNA" },
  { icon: Bell, label: "Alerts" },
  { icon: Calendar, label: "Calendar" },
];

export function LeftSidebar() {
  return (
    <aside className="w-16 shrink-0 border-r border-border bg-card/40 flex flex-col items-center py-3 gap-2 sticky top-12 self-start h-[calc(100vh-3rem)]">
      <div className="mb-2">
        <BrandLogo size={36} />
      </div>
      {items.map((it) => (
        <button
          key={it.label}
          title={it.label}
          className={`group relative size-10 rounded-lg flex items-center justify-center transition-colors ${
            it.active ? "bg-[var(--brand-blue-deep)] text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <it.icon className="size-[18px]" />
          {it.active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-[var(--brand-cyan)]" />}
        </button>
      ))}
      <div className="mt-auto">
        <button title="Settings" className="size-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Settings className="size-[18px]" />
        </button>
      </div>
    </aside>
  );
}
