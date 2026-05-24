import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Copy, Check } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useBot4xStore } from "@/lib/bot4x-store";
import { FILTER_NAMES, type FilterKey, type Tick } from "@/lib/bot4x-data";

export function TabMonitor() {
  return (
    <div className="space-y-5">
      <FilterPipeline />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3"><TickFeed /></div>
        <div className="lg:col-span-2"><JsonViewer /></div>
      </div>
      <FilterStats />
    </div>
  );
}

function FilterPipeline() {
  const last = useBot4xStore((s) => s.ticks[0]);
  const keys: FilterKey[] = ["F1", "F2", "F3", "F4", "F5", "F6"];
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Pipeline de filtros</div>
      <div className="flex items-center gap-1 overflow-x-auto">
        {keys.map((k) => {
          const pass = last ? last.filters[k] : true;
          const blocked = last?.blockedAt === k;
          const color = !last ? "#888780" : blocked ? "#E24B4A" : pass ? "#1D9E75" : "#888780";
          return (
            <div key={k} className="flex items-center gap-1 shrink-0">
              <motion.div
                key={`${last?.id}-${k}`}
                initial={{ scale: 0.94, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1, boxShadow: `0 0 0 1px ${color}, 0 0 16px -4px ${color}` }}
                transition={{ duration: 0.35 }}
                className="px-3 py-2 rounded-md border bg-background"
                style={{ borderColor: color }}
              >
                <div className="text-[10px] text-muted-foreground">{k}</div>
                <div className="text-[12px] font-semibold" style={{ color }}>{FILTER_NAMES[k]}</div>
              </motion.div>
              <span className="text-muted-foreground">→</span>
            </div>
          );
        })}
        <div
          className="px-3 py-2 rounded-md border shrink-0"
          style={{
            background: last?.verdict === "EXECUTE" ? "color-mix(in oklab,#1D9E75 18%,transparent)" : "color-mix(in oklab,#E24B4A 18%,transparent)",
            borderColor: last?.verdict === "EXECUTE" ? "#1D9E75" : "#E24B4A",
            color: last?.verdict === "EXECUTE" ? "#7AD9B4" : "#FF9B9A",
          }}
        >
          <div className="text-[10px] uppercase">Verdict</div>
          <div className="text-[12px] font-bold">{last?.verdict ?? "—"}</div>
        </div>
      </div>
    </section>
  );
}

function TickFeed() {
  const ticks = useBot4xStore((s) => s.ticks);
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-[12px] font-semibold text-foreground">Live tick feed</span>
        <span className="text-[10px] text-muted-foreground">{ticks.length} ticks · novo a cada 8s</span>
      </div>
      <div className="max-h-[480px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {ticks.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <TickRow tick={t} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

function TickRow({ tick }: { tick: Tick }) {
  const [open, setOpen] = useState(false);
  const keys: FilterKey[] = ["F1", "F2", "F3", "F4", "F5", "F6"];
  const okVerdict = tick.verdict === "EXECUTE";
  const time = new Date(tick.ts).toLocaleTimeString();
  return (
    <div className="px-4 py-2.5 border-b border-border text-[12px]">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 text-left">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-secondary text-foreground tabular-nums">{tick.pair}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{time}</span>
        <span className="flex items-center gap-1 ml-1">
          {keys.map((k) => {
            const pass = tick.filters[k];
            const blocked = tick.blockedAt === k;
            return (
              <span
                key={k}
                className="text-[10px] font-bold"
                style={{ color: blocked ? "#E24B4A" : pass ? "#1D9E75" : "#888780" }}
              >
                {k}{blocked ? "✗" : pass ? "✓" : "·"}
              </span>
            );
          })}
        </span>
        <span
          className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold"
          style={{
            background: okVerdict ? "color-mix(in oklab,#1D9E75 22%,transparent)" : "color-mix(in oklab,#E24B4A 22%,transparent)",
            color: okVerdict ? "#7AD9B4" : "#FF9B9A",
          }}
        >
          {okVerdict ? "EXECUTE" : "BLOCKED"}
        </span>
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <pre className="font-mono text-[10.5px] leading-relaxed mt-2 bg-background border border-border rounded-md p-2 overflow-x-auto text-foreground/80">
{JSON.stringify(tick.json, null, 2)}
        </pre>
      )}
    </div>
  );
}

function JsonViewer() {
  const tab = useBot4xStore((s) => s.monitorTab);
  const setTab = useBot4xStore((s) => s.setMonitorTab);
  const lastTick = useBot4xStore((s) => s.ticks[0]);
  const [copied, setCopied] = useState(false);

  const data = useMemo(() => {
    if (tab === "tick") return lastTick?.json ?? { info: "Sem ticks ainda" };
    if (tab === "order") return {
      id: "o1", pair: "BTC/USDT", side: "LONG", entry: 43240, sl: 43168, tp: 43385,
      leverage: 3, slotSize: 100, profile: "conservador", mode: "DEMO", openedAt: Date.now() - 240000,
    };
    return {
      reason: "no_shutdown",
      lastCheck: Date.now(),
      dailyPnlPct: -0.42,
      circuitBreaker: { armed: true, triggered: false, limit: -1.5 },
      trailingLock: { peak: 0, state: "INACTIVE" },
    };
  }, [tab, lastTick]);

  const json = JSON.stringify(data, null, 2);
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const tabs = [
    { id: "tick" as const, label: "Último tick" },
    { id: "order" as const, label: "Última ordem" },
    { id: "shutdown" as const, label: "Último shutdown" },
  ];

  return (
    <section className="rounded-lg border border-border bg-card h-full flex flex-col">
      <div className="px-4 py-2 border-b border-border flex items-center gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              tab === t.id ? "bg-[var(--brand-blue-deep)] text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={copy}
          className="ml-auto inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] text-foreground hover:bg-secondary"
        >
          {copied ? <Check className="size-3.5 text-[#1D9E75]" /> : <Copy className="size-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="font-mono text-[11px] leading-relaxed p-3 overflow-auto flex-1 text-foreground/85">
{json.split("\n").map((line, i) => (
  <div key={i}>
    {line.split(/("[^"]*"|-?\d+\.?\d*|true|false|null)/g).map((part, j) => {
      if (/^".*"$/.test(part)) return <span key={j} style={{ color: "#7AD9B4" }}>{part}</span>;
      if (/^-?\d+\.?\d*$/.test(part)) return <span key={j} style={{ color: "#EF9F27" }}>{part}</span>;
      if (part === "true" || part === "false") return <span key={j} style={{ color: "#7F77DD" }}>{part}</span>;
      if (part === "null") return <span key={j} style={{ color: "#888780" }}>{part}</span>;
      return <span key={j}>{part}</span>;
    })}
  </div>
))}
      </pre>
    </section>
  );
}

function FilterStats() {
  const ticks = useBot4xStore((s) => s.ticks);
  const stats = useMemo(() => {
    const counts: Record<string, number> = { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0 };
    let exec = 0, blocked = 0;
    for (const t of ticks) {
      if (t.blockedAt) counts[t.blockedAt]++;
      if (t.verdict === "EXECUTE") exec++; else blocked++;
    }
    return {
      bars: (Object.keys(counts) as FilterKey[]).map((k) => ({ name: k, blocks: counts[k] })),
      exec, blocked, total: ticks.length,
      passRate: ticks.length ? Math.round((exec / ticks.length) * 100) : 0,
    };
  }, [ticks]);

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Bloqueios por filtro</div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.bars}>
              <XAxis dataKey="name" stroke="#888780" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#888780" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#111318", border: "1px solid #1E2028", borderRadius: 6, fontSize: 12 }}
                cursor={{ fill: "color-mix(in oklab, #378ADD 8%, transparent)" }}
              />
              <Bar dataKey="blocks" fill="#E24B4A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Total ticks" value={`${stats.total}`} />
        <SummaryCard label="Executados" value={`${stats.exec}`} color="#1D9E75" />
        <SummaryCard label="Bloqueados" value={`${stats.blocked}`} color="#E24B4A" />
        <SummaryCard label="Pass rate" value={`${stats.passRate}%`} color="#378ADD" />
      </div>
    </section>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[18px] font-semibold tabular-nums mt-1" style={{ color: color ?? undefined }}>{value}</div>
    </div>
  );
}
