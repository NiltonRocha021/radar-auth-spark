import { motion } from "framer-motion";
import { CircularGauge } from "./circular-gauge";
import { GAUGES } from "@/lib/dna-data";

export function DnaHeader() {
  const consistency = GAUGES[0].value;
  const size = 88;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (consistency / 100) * c;

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-card/60 to-card/20 p-5">
      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90 absolute inset-0">
              <defs>
                <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--brand-cyan)" />
                  <stop offset="100%" stopColor="var(--brand-blue)" />
                </linearGradient>
              </defs>
              <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
              <motion.circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke="url(#ringGrad)"
                strokeWidth={stroke}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={c}
                initial={{ strokeDashoffset: c }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1.4, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-[6px] rounded-full bg-[var(--brand-blue-deep)] flex items-center justify-center text-foreground text-2xl font-semibold">
              T
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Trader archetype</div>
            <div className="text-2xl font-semibold tracking-tight bg-gradient-to-r from-[var(--brand-cyan)] to-purple-400 bg-clip-text text-transparent">
              MOMENTUM TRADER
            </div>
            <div className="text-xs text-muted-foreground mt-1">Consistency ring · {consistency}% filled</div>
          </div>
        </div>

        <div className="lg:ml-auto grid grid-cols-3 md:grid-cols-5 gap-3">
          {GAUGES.map((g) => (
            <CircularGauge key={g.label} value={g.value} label={g.label} />
          ))}
        </div>
      </div>
    </div>
  );
}
