import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend } from "recharts";
import { RADAR } from "@/lib/dna-data";

export function DnaRadar() {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <div className="mb-2">
        <h2 className="text-sm font-semibold">DNA radar</h2>
        <p className="text-xs text-muted-foreground">Your DNA vs Institutional Benchmark</p>
      </div>
      <div className="h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={RADAR} outerRadius="75%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="Your DNA" dataKey="you" stroke="#378ADD" fill="#378ADD" fillOpacity={0.3} strokeWidth={2} />
            <Radar name="Institutional benchmark" dataKey="bench" stroke="#7F77DD" fill="#7F77DD" fillOpacity={0.05} strokeDasharray="5 4" strokeWidth={2} />
            <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
