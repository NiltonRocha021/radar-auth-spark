import { Bell, Search, ChevronDown, LogOut, Settings, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardStore } from "@/lib/dashboard-store";
import { useState, useRef, useEffect } from "react";

export function TopBar() {
  const { user } = useAuth();
  const prices = useDashboardStore((s) => s.prices);
  const setCmdkOpen = useDashboardStore((s) => s.setCmdkOpen);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const name = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0]
    ?? user?.email?.split("@")[0]
    ?? "Trader";

  const btc = prices.BTC ?? { price: 43240, change: 1.8 };
  const eth = prices.ETH ?? { price: 2251, change: -0.4 };

  return (
    <header className="h-12 sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur flex items-center px-4 gap-6">
      {/* Left */}
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-[14px] text-muted-foreground">Dashboard</span>
        <span className="text-[16px] font-medium text-foreground truncate">{greeting}, {name}</span>
      </div>

      {/* Center */}
      <div className="hidden lg:flex items-center gap-4 mx-auto text-[13px] tabular-nums">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary border border-border">
          <span className="size-1.5 rounded-full bg-[#1D9E75] animate-pulse" />
          <span className="text-foreground">Markets Open</span>
        </span>
        <Ticker symbol="BTC" price={btc.price} change={btc.change} />
        <Ticker symbol="ETH" price={eth.price} change={eth.change} />
        <span className="text-muted-foreground">BTC Dom <span className="text-foreground">52.4%</span></span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 ml-auto">
        <span className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium"
          style={{ background: "color-mix(in oklab, #1D9E75 18%, transparent)", color: "#1D9E75", border: "1px solid color-mix(in oklab, #1D9E75 35%, transparent)" }}>
          68 · Greed
        </span>
        <button
          onClick={() => setCmdkOpen(true)}
          className="size-8 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Search (Cmd+K)"
        >
          <Search className="size-4" />
        </button>
        <button className="relative size-8 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="size-4" />
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[#E24B4A]" />
        </button>
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 px-2 h-8 rounded-md hover:bg-secondary"
          >
            <span className="size-7 rounded-full brand-gradient flex items-center justify-center text-[11px] font-semibold text-white uppercase">
              {name.slice(0, 1)}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
          {open && (
            <div className="absolute right-0 top-10 w-56 rounded-lg border border-border bg-card shadow-xl py-1.5 text-sm">
              <div className="px-3 py-2 border-b border-border">
                <div className="font-medium text-foreground truncate">{name}</div>
                <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
              </div>
              <MenuItem icon={<User className="size-4" />} label="Profile" />
              <MenuItem icon={<Settings className="size-4" />} label="Settings" />
              <div className="my-1 h-px bg-border" />
              <button
                onClick={() => supabase.auth.signOut()}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[#E24B4A] hover:bg-secondary"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Ticker({ symbol, price, change }: { symbol: string; price: number; change: number }) {
  const up = change >= 0;
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{symbol}</span>
      <span className="text-foreground">${price.toLocaleString(undefined, { maximumFractionDigits: price > 100 ? 0 : 2 })}</span>
      <span style={{ color: up ? "#1D9E75" : "#E24B4A" }}>{up ? "+" : ""}{change.toFixed(1)}%</span>
    </span>
  );
}

function MenuItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-secondary">
      {icon} {label}
    </button>
  );
}
