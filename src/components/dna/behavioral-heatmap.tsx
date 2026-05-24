import { buildHeatmap } from "@/lib/dna-data";
import { useMemo } from "react";

function colorFor(v: number) {
  if (v === 0) return "var(--secondary)";
  if (v === -1) return "oklch(0.52 0.20 25)";
  // green shades
  const shades = ["oklch(0.45 0.13 145)", "oklch(0.55 0.16 145)", "oklch(0.65 0.18 145)", "oklch(0.75 0.20 145)"];
  return shades[Math.min(v, 4) - 1];
}

export function BehavioralHeatmap() {
  const data = useMemo(() => buildHeatmap(), []);
  // Group into weeks (columns). First week may have empty leading cells.
  const weeks: ({ date: Date; value: number } | null)[][] = [];
  let current: ({ date: Date; value: number } | null)[] = [];
  const first = data[0].date.getDay();
  for (let i = 0; i < first; i++) current.push(null);
  for (const d of data) {
    current.push(d);
    if (current.length === 7) { weeks.push(current); current = []; }
  }
  if (current.length) { while (current.length < 7) current.push(null); weeks.push(current); }

  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">Behavioral heatmap</h2>
          <p className="text-xs text-muted-foreground">Last 90 days — green: profit · red: loss · gray: no trades</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Less</span>
          {[-1, 0, 1, 2, 3, 4].map((v) => (
            <span key={v} className="size-3 rounded-sm" style={{ background: colorFor(v) }} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-1.5 min-w-fit">
          <div className="flex flex-col gap-1 mr-1 text-[10px] text-muted-foreground pt-0.5">
            {dayLabels.map((d, i) => (
              <span key={i} className="h-3 leading-3" style={{ visibility: i % 2 ? "visible" : "hidden" }}>{d}</span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((d, di) => (
                <div
                  key={di}
                  className="size-3 rounded-sm transition-transform hover:scale-150"
                  style={{ background: d ? colorFor(d.value) : "transparent" }}
                  title={d ? `${d.date.toDateString()} · ${d.value === -1 ? "Loss" : d.value === 0 ? "No trades" : `+${d.value} units`}` : ""}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5 pt-4 border-t border-border">
        {[
          { l: "Best day", v: "Tuesday" },
          { l: "Worst day", v: "Monday" },
          { l: "Most active", v: "Wednesday" },
          { l: "Best session", v: "London Open" },
          { l: "Avg trades / day", v: "3.2" },
        ].map((s) => (
          <div key={s.l}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.l}</div>
            <div className="text-sm font-medium mt-0.5">{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
