import { Activity, Trophy, TrendingUp, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { ScoreBadge } from "./score-badge";
import { useCountUp } from "@/lib/use-count-up";

export function MetricCards() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        index={0}
        icon={<Activity className="size-4" />}
        iconColor="#378ADD"
        label="Active Signals"
        countTo={24}
        trend={{ text: "+8 vs yesterday", color: "#1D9E75" }}
        sub="7 high score (≥80)"
      />
      <Card
        index={1}
        icon={<Trophy className="size-4" />}
        iconColor="#EF9F27"
        label="Top Signal Score"
        valueNode={<ScoreBadge score={94} size="lg" />}
        sub="BTC/USDT · BUY · 4H"
        trend={{ text: "Institutional Premium", color: "#EF9F27" }}
      />
      <Card
        index={2}
        icon={<TrendingUp className="size-4" />}
        iconColor="#1D9E75"
        label="Market Trend"
        value="Bullish"
        valueColor="#1D9E75"
        sub="14 of 20 assets trending up"
      />
      <Card
        index={3}
        icon={<AlertTriangle className="size-4" />}
        iconColor="#E24B4A"
        label="Manipulation Alerts"
        countTo={3}
        valueColor="#E24B4A"
        sub="BTC · ETH · SOL"
        pulse
      />
    </div>
  );
}

function Card({
  index, icon, iconColor, label, value, valueNode, valueColor, sub, trend, pulse, countTo,
}: {
  index: number;
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  valueColor?: string;
  sub: string;
  trend?: { text: string; color: string };
  pulse?: boolean;
  countTo?: number;
}) {
  const counted = useCountUp(countTo ?? 0, 1200);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: "easeOut" }}
      className="rounded-xl border border-border bg-card p-4 relative overflow-hidden"
    >
      <div className="flex items-start justify-between">
        <div
          className="size-8 rounded-lg flex items-center justify-center"
          style={{
            background: `color-mix(in oklab, ${iconColor} 16%, transparent)`,
            color: iconColor,
          }}
        >
          {icon}
        </div>
        {pulse && <span className="size-2 rounded-full bg-[#E24B4A] animate-pulse" />}
      </div>
      <div className="mt-3 text-[12px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        {valueNode ?? (
          <span className="text-[28px] font-semibold tabular-nums" style={{ color: valueColor ?? "var(--foreground)" }}>
            {countTo !== undefined ? counted : value}
          </span>
        )}
      </div>
      <div className="mt-2 text-[12px] text-muted-foreground">{sub}</div>
      {trend && (
        <div className="mt-1 text-[12px] font-medium" style={{ color: trend.color }}>{trend.text}</div>
      )}
    </motion.div>
  );
}
