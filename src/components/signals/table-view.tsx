import { useState } from "react";
import { Bell, Bookmark, Download, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { ScoreBadge } from "@/components/dashboard/score-badge";
import { type Signal, formatPrice, formatAge } from "@/lib/signals-data";
import { useSignalsStore } from "@/lib/signals-store";

const PAGE = 20;

export function TableView({ signals }: { signals: Signal[] }) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const setHover = useSignalsStore((s) => s.setHover);
  const pin = useSignalsStore((s) => s.pin);

  const totalPages = Math.max(1, Math.ceil(signals.length / PAGE));
  const slice = signals.slice(page * PAGE, page * PAGE + PAGE);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-[color-mix(in_oklab,var(--brand-blue)_15%,transparent)] text-[12px]">
          <span className="text-foreground font-medium">{selected.size} selected</span>
          <div className="ml-auto flex gap-2">
            <ActionBtn icon={<Bell className="size-3" />} label="Set alerts" />
            <ActionBtn icon={<Bookmark className="size-3" />} label="Save all" />
            <ActionBtn icon={<Download className="size-3" />} label="Export CSV" />
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-background/40 text-muted-foreground">
            <tr className="text-left">
              <Th className="w-8"></Th>
              <Th>#</Th>
              <Th>Asset</Th>
              <Th>Dir</Th>
              <Th>Score</Th>
              <Th>Entry</Th>
              <Th>Stop</Th>
              <Th>Target</Th>
              <Th>R/R</Th>
              <Th>Risk%</Th>
              <Th>TF</Th>
              <Th>Exchange</Th>
              <Th>Setup</Th>
              <Th>Confirms</Th>
              <Th>DNA%</Th>
              <Th>Manip</Th>
              <Th>Age</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {slice.map((s, i) => {
              const accent = s.direction === "BUY" ? "#1D9E75" : "#E24B4A";
              const opacity = s.status === "expired" ? 0.45 : 1;
              const checked = selected.has(s.id);
              return (
                <tr
                  key={s.id}
                  onMouseEnter={() => setHover(s.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => pin(s.id)}
                  className={`border-t border-border hover:bg-secondary/40 transition-colors cursor-pointer ${
                    i % 2 === 1 ? "bg-background/20" : ""
                  }`}
                  style={{ opacity }}
                >
                  <Td>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggle(s.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-[var(--brand-cyan)]"
                    />
                  </Td>
                  <Td className="text-muted-foreground tabular-nums">{page * PAGE + i + 1}</Td>
                  <Td className="font-semibold text-foreground">{s.asset}</Td>
                  <Td>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: `color-mix(in oklab, ${accent} 22%, transparent)`, color: accent }}
                    >
                      {s.direction}
                    </span>
                  </Td>
                  <Td>
                    <ScoreBadge score={s.score} size="sm" />
                  </Td>
                  <Td className="tabular-nums">{formatPrice(s.entry)}</Td>
                  <Td className="tabular-nums text-[#E24B4A]">{formatPrice(s.stop)}</Td>
                  <Td className="tabular-nums text-[#1D9E75]">{formatPrice(s.target)}</Td>
                  <Td className="tabular-nums font-medium">{s.rr.toFixed(1)}</Td>
                  <Td className="tabular-nums">{s.riskPct}%</Td>
                  <Td>{s.tf}</Td>
                  <Td className="text-muted-foreground">{s.exchange}</Td>
                  <Td className="text-muted-foreground">{s.setup}</Td>
                  <Td>
                    <span className="tabular-nums text-foreground">
                      {Object.values(s.confirms).filter(Boolean).length}/5
                    </span>
                  </Td>
                  <Td className="tabular-nums">{s.dnaMatch}%</Td>
                  <Td>
                    {s.manipRisk === "low" ? (
                      <ShieldCheck className="size-3.5 text-[#1D9E75]" />
                    ) : s.manipRisk === "medium" ? (
                      <Shield className="size-3.5 text-[#EF9F27]" />
                    ) : (
                      <ShieldAlert className="size-3.5 text-[#E24B4A]" />
                    )}
                  </Td>
                  <Td className="text-muted-foreground">{formatAge(s.ageMin)}</Td>
                  <Td>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="text-[var(--brand-cyan)] hover:underline"
                    >
                      View →
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-t border-border text-[12px] text-muted-foreground">
        <span>
          Page {page + 1} of {totalPages} · {signals.length} signals
        </span>
        <div className="flex gap-1">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="h-7 px-2.5 rounded-md border border-border hover:text-foreground disabled:opacity-30"
          >
            Prev
          </button>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="h-7 px-2.5 rounded-md border border-border hover:text-foreground disabled:opacity-30"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium text-[11px] uppercase tracking-wide ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-foreground ${className ?? ""}`}>{children}</td>;
}
function ActionBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="h-7 px-2.5 rounded-md border border-border bg-card text-foreground hover:border-[var(--brand-cyan)] inline-flex items-center gap-1 transition-colors">
      {icon} {label}
    </button>
  );
}
