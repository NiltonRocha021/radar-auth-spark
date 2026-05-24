import { useMemo, useState } from "react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { Download, Search } from "lucide-react";
import { useBot4xStore } from "@/lib/bot4x-store";
import { PROFILES, type CalibProfile, type Trade, fmt } from "@/lib/bot4x-data";

export function TabHistorico() {
  return (
    <div className="space-y-5">
      <HeaderRow />
      <Metrics />
      <EquityCurve />
      <TradeSection />
      <PerformanceTabs />
    </div>
  );
}

function HeaderRow() {
  const history = useBot4xStore((s) => s.history);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const exportCSV = () => {
    const head = ["#", "day", "pair", "side", "entry", "stop", "target", "result", "pnl", "pnlPct", "accumulated", "profile", "leverage", "motivo"];
    const rows = history.map((t, i) =>
      [i + 1, t.day, t.pair, t.side, t.entry, t.stop, t.target, t.result, t.pnl, t.pnlPct, t.accumulated, t.profile, t.leverage, t.motivo].join(",")
    );
    const csv = [head.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "bot4x-history.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 rounded-md bg-card border border-border px-3 h-9">
        <span className="text-[11px] text-muted-foreground">De</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-transparent text-[12px] text-foreground outline-none" />
        <span className="text-[11px] text-muted-foreground">até</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-transparent text-[12px] text-foreground outline-none" />
      </div>
      <button
        onClick={exportCSV}
        className="ml-auto inline-flex items-center gap-2 h-9 px-3 rounded-md bg-[var(--brand-blue)] text-white text-[12px] font-medium hover:bg-[var(--brand-cyan)]"
      >
        <Download className="size-3.5" /> Export CSV
      </button>
    </section>
  );
}

function Metrics() {
  const history = useBot4xStore((s) => s.history);
  const m = useMemo(() => {
    const total = history.length;
    const wins = history.filter((t) => t.result === "WIN").length;
    const losses = history.filter((t) => t.result === "LOSS").length;
    const pnl = history.reduce((a, t) => a + t.pnl, 0);
    const wr = wins + losses ? (wins / (wins + losses)) * 100 : 0;
    let peak = -Infinity, maxDD = 0;
    for (const t of history) {
      peak = Math.max(peak, t.accumulated);
      maxDD = Math.min(maxDD, (t.accumulated - peak) / peak * 100);
    }
    return { total, wins, losses, pnl, wr, maxDD };
  }, [history]);

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card label="Total PnL" value={`${m.pnl >= 0 ? "+" : ""}${fmt(m.pnl)} USDT`} color={m.pnl >= 0 ? "#1D9E75" : "#E24B4A"} />
      <Card label="Win rate" value={`${m.wr.toFixed(1)}%`} color="#1D9E75" />
      <Card label="Total trades" value={`${m.total}`} />
      <Card label="Max drawdown" value={`${m.maxDD.toFixed(2)}%`} color="#E24B4A" />
    </section>
  );
}

function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[18px] font-semibold tabular-nums mt-1" style={{ color: color ?? undefined }}>{value}</div>
    </div>
  );
}

function EquityCurve() {
  const history = useBot4xStore((s) => s.history);
  const data = useMemo(() => history.map((t, i) => ({ x: i, day: t.day, capital: t.accumulated })), [history]);
  const start = data[0]?.capital ?? 1000;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Equity curve</div>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#378ADD" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#378ADD" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" stroke="#888780" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={32} />
            <YAxis stroke="#888780" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={["dataMin - 20", "dataMax + 20"]} />
            <Tooltip
              contentStyle={{ background: "#111318", border: "1px solid #1E2028", borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: "#888780" }}
            />
            <ReferenceLine y={start * (1 - 0.015)} stroke="#E24B4A" strokeDasharray="3 3" label={{ value: "-1.5%", fill: "#E24B4A", fontSize: 10, position: "right" }} />
            <ReferenceLine y={start * (1 + 0.03)} stroke="#1D9E75" strokeDasharray="3 3" label={{ value: "+3%", fill: "#1D9E75", fontSize: 10, position: "right" }} />
            <ReferenceLine y={start * (1 + 0.04)} stroke="#7F77DD" strokeDasharray="3 3" label={{ value: "+4%", fill: "#7F77DD", fontSize: 10, position: "right" }} />
            <Area type="monotone" dataKey="capital" stroke="#378ADD" strokeWidth={2} fill="url(#eq)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TradeSection() {
  const history = useBot4xStore((s) => s.history);
  const [pair, setPair] = useState("all");
  const [result, setResult] = useState("all");
  const [profile, setProfile] = useState("all");
  const [lev, setLev] = useState("all");
  const [side, setSide] = useState("all");
  const [search, setSearch] = useState("");

  const pairs = useMemo(() => Array.from(new Set(history.map((t) => t.pair))), [history]);

  const filtered = useMemo(() => {
    return history
      .slice()
      .reverse()
      .filter((t) => pair === "all" || t.pair === pair)
      .filter((t) => result === "all" || t.result === result)
      .filter((t) => profile === "all" || t.profile === profile)
      .filter((t) => lev === "all" || String(t.leverage) === lev)
      .filter((t) => side === "all" || t.side === side)
      .filter((t) => !search || t.pair.toLowerCase().includes(search.toLowerCase()) || t.motivo.toLowerCase().includes(search.toLowerCase()));
  }, [history, pair, result, profile, lev, side, search]);

  const rowBg = (r: Trade["result"]) =>
    r === "WIN" ? { borderLeftColor: "#1D9E75" }
      : r === "LOSS" ? { borderLeftColor: "#E24B4A" }
      : r === "BLOCKED" ? { borderLeftColor: "#888780" }
      : { borderLeftColor: "#E24B4A", background: "color-mix(in oklab,#E24B4A 6%,transparent)" };

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        <Select value={pair} onChange={setPair} options={[{ v: "all", l: "Todos pares" }, ...pairs.map((p) => ({ v: p, l: p }))]} />
        <Select value={result} onChange={setResult} options={[{ v: "all", l: "Resultado" }, { v: "WIN", l: "WIN" }, { v: "LOSS", l: "LOSS" }, { v: "BLOCKED", l: "BLOCKED" }, { v: "SHUTDOWN", l: "SHUTDOWN" }]} />
        <Select value={profile} onChange={setProfile} options={[{ v: "all", l: "Perfil" }, ...Object.values(PROFILES).map((p) => ({ v: p.id, l: p.name }))]} />
        <Select value={lev} onChange={setLev} options={[{ v: "all", l: "Lev" }, ...Array.from({ length: 10 }, (_, i) => ({ v: String(i + 1), l: `${i + 1}x` }))]} />
        <Select value={side} onChange={setSide} options={[{ v: "all", l: "Lado" }, { v: "LONG", l: "LONG" }, { v: "SHORT", l: "SHORT" }]} />
        <div className="ml-auto relative">
          <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="h-8 pl-7 pr-2 rounded-md bg-background border border-border text-[12px] text-foreground focus:outline-none focus:border-[var(--brand-cyan)] w-44"
          />
        </div>
      </div>

      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-card text-muted-foreground border-b border-border">
            <tr>
              {["#", "Dia", "Par", "Lado", "Entrada", "Stop", "Alvo", "Result", "PnL", "PnL%", "Acumulado", "Perfil", "Lev", "Motivo"].map((h) => (
                <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => {
              const p = PROFILES[t.profile];
              const sideColor = t.side === "LONG" ? "#1D9E75" : "#E24B4A";
              const pnlColor = t.pnl >= 0 ? "#1D9E75" : "#E24B4A";
              return (
                <tr key={t.id} className="border-b border-border/60 hover:bg-secondary/30" style={{ borderLeft: "3px solid", ...rowBg(t.result) }}>
                  <td className="px-2 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2 tabular-nums">{t.day}</td>
                  <td className="px-2 py-2 font-semibold text-foreground">{t.pair}</td>
                  <td className="px-2 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: `color-mix(in oklab, ${sideColor} 22%, transparent)`, color: sideColor }}>{t.side}</span></td>
                  <td className="px-2 py-2 tabular-nums">{fmt(t.entry)}</td>
                  <td className="px-2 py-2 tabular-nums text-[#E24B4A]">{fmt(t.stop)}</td>
                  <td className="px-2 py-2 tabular-nums text-[#1D9E75]">{fmt(t.target)}</td>
                  <td className="px-2 py-2"><ResultBadge r={t.result} /></td>
                  <td className="px-2 py-2 tabular-nums font-semibold" style={{ color: pnlColor }}>{t.pnl >= 0 ? "+" : ""}{fmt(t.pnl)}</td>
                  <td className="px-2 py-2 tabular-nums" style={{ color: pnlColor }}>{t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%</td>
                  <td className="px-2 py-2 tabular-nums">{fmt(t.accumulated)}</td>
                  <td className="px-2 py-2"><span className="inline-flex items-center gap-1 text-[11px]"><span className="size-1.5 rounded-full" style={{ background: p.color }} />{p.name}</span></td>
                  <td className="px-2 py-2 tabular-nums">{t.leverage}x</td>
                  <td className="px-2 py-2 text-muted-foreground">{t.motivo}</td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr><td colSpan={14} className="px-4 py-10 text-center text-muted-foreground text-[12px]">Nenhum trade no filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResultBadge({ r }: { r: Trade["result"] }) {
  const map: Record<Trade["result"], string> = { WIN: "#1D9E75", LOSS: "#E24B4A", BLOCKED: "#888780", SHUTDOWN: "#E24B4A" };
  const c = map[r];
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: `color-mix(in oklab, ${c} 22%, transparent)`, color: c }}>{r}</span>;
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 px-2 rounded-md bg-background border border-border text-[12px] text-foreground focus:outline-none focus:border-[var(--brand-cyan)]"
    >
      {options.map((o) => (<option key={o.v} value={o.v}>{o.l}</option>))}
    </select>
  );
}

// ----- Performance tabs -----
function PerformanceTabs() {
  const history = useBot4xStore((s) => s.history);
  const [tab, setTab] = useState<"profile" | "leverage" | "pair" | "hour">("profile");

  const tabs = [
    { id: "profile" as const, label: "Por Perfil" },
    { id: "leverage" as const, label: "Por Leverage" },
    { id: "pair" as const, label: "Por Par" },
    { id: "hour" as const, label: "Por Hora" },
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="px-4 py-2 border-b border-border flex items-center gap-1">
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
      </div>
      <div className="p-4">
        {tab === "profile" && <GroupTable history={history} keyFn={(t) => t.profile} labelFn={(k) => PROFILES[k as CalibProfile]?.name ?? k} colorFn={(k) => PROFILES[k as CalibProfile]?.color} />}
        {tab === "leverage" && <GroupTable history={history} keyFn={(t) => `${t.leverage}x`} />}
        {tab === "pair" && <GroupTable history={history} keyFn={(t) => t.pair} />}
        {tab === "hour" && <HourHeatmap history={history} />}
      </div>
    </section>
  );
}

function GroupTable({
  history, keyFn, labelFn, colorFn,
}: {
  history: Trade[];
  keyFn: (t: Trade) => string;
  labelFn?: (k: string) => string;
  colorFn?: (k: string) => string | undefined;
}) {
  const rows = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; losses: number; pnl: number }>();
    for (const t of history) {
      const k = keyFn(t);
      const cur = map.get(k) ?? { trades: 0, wins: 0, losses: 0, pnl: 0 };
      cur.trades++;
      if (t.result === "WIN") cur.wins++;
      else if (t.result === "LOSS") cur.losses++;
      cur.pnl += t.pnl;
      map.set(k, cur);
    }
    return Array.from(map.entries()).map(([k, v]) => ({
      k, ...v,
      wr: v.wins + v.losses ? (v.wins / (v.wins + v.losses)) * 100 : 0,
    })).sort((a, b) => b.pnl - a.pnl);
  }, [history, keyFn]);

  return (
    <table className="w-full text-[12px]">
      <thead className="text-muted-foreground">
        <tr><th className="text-left font-medium px-2 py-2">Grupo</th><th className="px-2 py-2 text-right">Trades</th><th className="px-2 py-2 text-right">WR</th><th className="px-2 py-2 text-right">W/L</th><th className="px-2 py-2 text-right">PnL</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.k} className="border-t border-border">
            <td className="px-2 py-2 text-foreground">
              <span className="inline-flex items-center gap-2">
                {colorFn && <span className="size-1.5 rounded-full" style={{ background: colorFn(r.k) }} />}
                {labelFn ? labelFn(r.k) : r.k}
              </span>
            </td>
            <td className="px-2 py-2 text-right tabular-nums">{r.trades}</td>
            <td className="px-2 py-2 text-right tabular-nums" style={{ color: r.wr >= 55 ? "#1D9E75" : r.wr >= 45 ? "#EF9F27" : "#E24B4A" }}>{r.wr.toFixed(1)}%</td>
            <td className="px-2 py-2 text-right tabular-nums">{r.wins}/{r.losses}</td>
            <td className="px-2 py-2 text-right tabular-nums font-semibold" style={{ color: r.pnl >= 0 ? "#1D9E75" : "#E24B4A" }}>{r.pnl >= 0 ? "+" : ""}{fmt(r.pnl)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HourHeatmap({ history }: { history: Trade[] }) {
  const cells = useMemo(() => {
    const arr = Array.from({ length: 24 }, () => ({ trades: 0, wins: 0, pnl: 0 }));
    for (const t of history) {
      arr[t.hour].trades++;
      if (t.result === "WIN") arr[t.hour].wins++;
      arr[t.hour].pnl += t.pnl;
    }
    return arr.map((c, h) => ({ h, ...c, wr: c.trades ? (c.wins / c.trades) * 100 : 0 }));
  }, [history]);
  const max = Math.max(1, ...cells.map((c) => Math.abs(c.pnl)));

  return (
    <div>
      <div className="grid grid-cols-12 gap-1">
        {cells.map((c) => {
          const intensity = Math.min(1, Math.abs(c.pnl) / max);
          const bg = c.pnl >= 0
            ? `color-mix(in oklab, #1D9E75 ${Math.round(intensity * 70)}%, transparent)`
            : `color-mix(in oklab, #E24B4A ${Math.round(intensity * 70)}%, transparent)`;
          return (
            <div
              key={c.h}
              className="aspect-square rounded-md border border-border flex flex-col items-center justify-center text-[10px] tabular-nums"
              style={{ background: bg }}
              title={`${c.h}:00 — ${c.trades} trades · WR ${c.wr.toFixed(0)}% · PnL ${c.pnl.toFixed(2)}`}
            >
              <span className="text-muted-foreground">{c.h}h</span>
              <span className="text-foreground font-semibold">{c.trades}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-[#E24B4A]" /> Perda</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-[#1D9E75]" /> Ganho</span>
        <span>· intensidade = magnitude do PnL</span>
      </div>
    </div>
  );
}
