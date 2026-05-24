import { HEATMAP, TIMEFRAMES } from "@/lib/manipulation-data";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

function bg(v: number) {
  if (v >= 85) return "oklch(0.55 0.24 27)";
  if (v >= 70) return "oklch(0.50 0.20 27)";
  if (v >= 40) return "oklch(0.72 0.17 70)";
  if (v >= 20) return "oklch(0.45 0.10 240)";
  return "oklch(0.32 0.08 250)";
}

export function InstitutionalHeatmap() {
  const [open, setOpen] = useState<{ asset: string; tf: string; v: number } | null>(null);
  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">Institutional heatmap</h2>
          <p className="text-xs text-muted-foreground">Manipulation pressure score · click any cell</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Low</span>
          {[10, 30, 50, 75, 90].map((v) => (
            <span key={v} className="size-3 rounded-sm" style={{ background: bg(v) }} />
          ))}
          <span>Critical</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="text-[10px] uppercase tracking-wider text-muted-foreground text-left w-14"></th>
              {TIMEFRAMES.map((tf) => (
                <th key={tf} className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  {tf}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HEATMAP.map((row) => (
              <tr key={row.asset}>
                <td className="text-xs font-medium text-foreground/80 pr-2">{row.asset}</td>
                {row.values.map((v, i) => {
                  const critical = v > 85;
                  return (
                    <td key={i}>
                      <button
                        onClick={() => setOpen({ asset: row.asset, tf: TIMEFRAMES[i], v })}
                        className={`relative w-full h-9 rounded-md text-[11px] font-medium text-foreground/90 transition-transform hover:scale-[1.04] ${
                          critical ? "manip-cell-pulse" : ""
                        }`}
                        style={{ background: bg(v) }}
                      >
                        {v}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="bg-card border-border">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {open.asset} · {open.tf} — pressure {open.v}
                </SheetTitle>
                <SheetDescription>
                  Aggregate institutional manipulation score derived from order book imbalance, CVD divergence,
                  spoofing attempts, and abnormal trade clustering.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <Row k="Order book imbalance" v={`${Math.round(open.v * 0.9)}%`} />
                <Row k="Spoof attempts (1h)" v={`${Math.round(open.v / 4)}`} />
                <Row k="CVD divergence" v={open.v > 60 ? "Strong" : "Mild"} />
                <Row k="Cluster anomalies" v={open.v > 70 ? "3 detected" : "None"} />
                <div className="pt-3 border-t border-border text-xs text-muted-foreground">
                  {open.v > 85
                    ? "Critical: high probability of coordinated activity. Defensive posture recommended."
                    : open.v > 60
                    ? "Elevated: watch for traps around key liquidity zones."
                    : "Normal institutional flow within expected range."}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <style>{`
        @keyframes manipCellPulse {
          0%, 100% { box-shadow: 0 0 0 1px rgba(239,68,68,0.9), 0 0 12px rgba(239,68,68,0.3); }
          50% { box-shadow: 0 0 0 2px rgba(239,68,68,1), 0 0 22px rgba(239,68,68,0.7); }
        }
        .manip-cell-pulse { animation: manipCellPulse 1.2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
