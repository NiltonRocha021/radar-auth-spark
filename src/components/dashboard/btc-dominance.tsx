import { Area, AreaChart, ResponsiveContainer, YAxis, Tooltip } from "recharts";
import { btcDomSeries } from "@/lib/dashboard-data";

export function BtcDominance() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 h-full flex flex-col">
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-[15px] font-medium text-foreground">BTC Dominance</h3>
          <p className="text-[11px] text-muted-foreground">Last 30 days</p>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-semibold tabular-nums text-foreground">52.4%</div>
          <div className="text-[11px] font-medium" style={{ color: "#1D9E75" }}>↑ +1.2% this week</div>
        </div>
      </div>
      <div className="flex-1 min-h-[180px] mt-2 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={btcDomSeries}>
            <defs>
              <linearGradient id="dom" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#378ADD" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#378ADD" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin - 0.5", "dataMax + 0.5"]} />
            <Tooltip
              contentStyle={{ background: "#111318", border: "1px solid #1E2028", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(l) => `Day ${l}`}
              formatter={(v: number) => [`${v.toFixed(2)}%`, "BTC Dom"]}
            />
            <Area type="monotone" dataKey="value" stroke="#378ADD" strokeWidth={2} fill="url(#dom)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
