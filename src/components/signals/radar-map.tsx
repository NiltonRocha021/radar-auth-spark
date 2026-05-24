import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { type Signal, formatPrice } from "@/lib/signals-data";

export function RadarMap({ signals }: { signals: Signal[] }) {
  const buys = signals.filter((s) => s.direction === "BUY").map((s) => ({ ...s, x: s.rr, y: s.score, z: s.volDelta }));
  const sells = signals.filter((s) => s.direction === "SELL").map((s) => ({ ...s, x: s.rr, y: s.score, z: s.volDelta }));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[14px] font-medium text-foreground">Radar Map</h3>
        <span className="text-[11px] text-muted-foreground">R/R × Score · bubble = volume</span>
      </div>
      <div className="relative h-[520px]">
        {/* Quadrant labels */}
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 pointer-events-none z-10 text-[10px] uppercase tracking-wider">
          <div className="flex items-start justify-start p-3 text-muted-foreground/70">High score low R/R</div>
          <div className="flex items-start justify-end p-3 text-[#1D9E75]/80 font-medium">Best opportunities</div>
          <div className="flex items-end justify-start p-3 text-[#E24B4A]/70">Avoid</div>
          <div className="flex items-end justify-end p-3 text-muted-foreground/70">High R/R lower confidence</div>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
            <CartesianGrid stroke="#1E2028" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name="R/R"
              domain={[0, 6]}
              tick={{ fill: "#888780", fontSize: 11 }}
              label={{ value: "R/R ratio", position: "insideBottom", offset: -10, fill: "#888780", fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Score"
              domain={[40, 100]}
              tick={{ fill: "#888780", fontSize: 11 }}
              label={{ value: "Score", angle: -90, position: "insideLeft", fill: "#888780", fontSize: 11 }}
            />
            <ZAxis type="number" dataKey="z" range={[60, 400]} />
            <ReferenceLine x={2.5} stroke="#1E2028" strokeDasharray="4 4" />
            <ReferenceLine y={75} stroke="#1E2028" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "#378ADD" }}
              contentStyle={{
                background: "#111318",
                border: "1px solid #1E2028",
                borderRadius: 8,
                fontSize: 11,
              }}
              content={({ payload }) => {
                if (!payload?.length) return null;
                const s = payload[0].payload as Signal;
                return (
                  <div className="rounded-lg border border-border bg-card p-2.5 text-[11px]">
                    <div className="font-semibold text-foreground">{s.asset} · {s.direction}</div>
                    <div className="text-muted-foreground">Score <span className="text-foreground tabular-nums">{s.score}</span></div>
                    <div className="text-muted-foreground">R/R <span className="text-foreground tabular-nums">{s.rr.toFixed(1)}</span></div>
                    <div className="text-muted-foreground">Entry <span className="text-foreground tabular-nums">{formatPrice(s.entry)}</span></div>
                    <div className="text-muted-foreground">Vol <span className="text-[#1D9E75] tabular-nums">↑{s.volDelta}%</span></div>
                  </div>
                );
              }}
            />
            <Scatter name="BUY" data={buys} fill="#1D9E75" fillOpacity={0.75} />
            <Scatter name="SELL" data={sells} fill="#E24B4A" fillOpacity={0.75} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
