import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { useBot4xStore } from "@/lib/bot4x-store";
import { PROFILES, type CalibProfile, type ProfileSpec } from "@/lib/bot4x-data";

export function TabCalibrador() {
  return (
    <div className="space-y-5">
      <ProfileGrid />
      <ImpactSummary />
      <LeverageMatrix />
      <PromptInjection />
    </div>
  );
}

function ProfileGrid() {
  const active = useBot4xStore((s) => s.profile);
  const set = useBot4xStore((s) => s.setProfile);
  const order: CalibProfile[] = ["conservador", "rsi", "aiscore", "agressivo"];

  return (
    <section>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Perfis de calibração</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {order.map((id) => {
          const p = PROFILES[id];
          const isActive = active === id;
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-lg bg-card p-4 border transition-colors"
              style={{
                borderColor: isActive ? p.color : "var(--border)",
                boxShadow: isActive ? `0 0 0 1px ${p.color}, 0 8px 30px -12px color-mix(in oklab, ${p.color} 40%, transparent)` : undefined,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-foreground">{p.name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: `color-mix(in oklab, ${p.color} 22%, transparent)`, color: p.color }}>
                      Risco {p.riskRank}/4
                    </span>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground mt-1 max-w-[34ch]">{p.desc}</p>
                </div>
                <RiskMeter rank={p.riskRank} color={p.color} />
              </div>

              <div className="mt-3 rounded-md bg-background border border-border px-3 py-2 font-mono text-[11px] text-foreground/85 space-y-0.5">
                <div>rsi.buy &lt; {p.rsiBuy} · rsi.sell &gt; {p.rsiSell}</div>
                <div>aiScore ≥ {p.aiScore}</div>
                <div>fomo ≤ {p.fomo}%</div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <Mini label="Win rate" value={`~${p.wr}%`} color={p.color} />
                <Mini label="RSI" value={`<${p.rsiBuy}/>${p.rsiSell}`} />
                <Mini label="aiScore" value={`≥${p.aiScore}`} />
              </div>

              <button
                onClick={() => set(id)}
                className={`mt-3 w-full h-9 rounded-md text-[13px] font-semibold transition-colors ${
                  isActive ? "text-white" : "bg-secondary text-foreground hover:bg-secondary/70"
                }`}
                style={isActive ? { background: p.color } : undefined}
              >
                {isActive ? "Ativo ✓" : "Ativar"}
              </button>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function RiskMeter({ rank, color }: { rank: 1 | 2 | 3 | 4; color: string }) {
  return (
    <div className="flex gap-0.5 mt-1">
      {[1, 2, 3, 4].map((n) => (
        <div
          key={n}
          className="w-1.5 h-5 rounded-sm"
          style={{ background: n <= rank ? color : "color-mix(in oklab, var(--border) 80%, transparent)" }}
        />
      ))}
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md bg-background border border-border px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[12px] font-semibold tabular-nums" style={{ color: color ?? undefined }}>{value}</div>
    </div>
  );
}

function ImpactSummary() {
  const active = useBot4xStore((s) => s.profile);
  const cur = PROFILES[active];
  const base = PROFILES.conservador;
  const items = [
    { label: "Win rate", cur: `${cur.wr}%`, base: `${base.wr}%`, delta: cur.wr - base.wr, color: cur.color },
    { label: "Sinais/dia (est)", cur: `${5 + cur.riskRank * 6}`, base: `${5 + base.riskRank * 6}`, delta: cur.riskRank * 6 - base.riskRank * 6, color: "#378ADD" },
    { label: "aiScore mín.", cur: `${cur.aiScore}`, base: `${base.aiScore}`, delta: cur.aiScore - base.aiScore, color: "#7F77DD" },
    { label: "FOMO máx.", cur: `${cur.fomo}%`, base: `${base.fomo}%`, delta: cur.fomo - base.fomo, color: "#EF9F27" },
  ];

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it) => (
        <div key={it.label} className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
          <div className="text-[18px] font-semibold tabular-nums mt-1 text-foreground">{it.cur}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            vs Conservador <span style={{ color: it.delta === 0 ? "#888780" : it.delta > 0 ? "#1D9E75" : "#E24B4A" }}>
              {it.delta === 0 ? "=" : `${it.delta > 0 ? "+" : ""}${it.delta}`}
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}

function LeverageMatrix() {
  const profiles: ProfileSpec[] = Object.values(PROFILES);
  const levs = Array.from({ length: 10 }, (_, i) => i + 1);
  const sym = (s: "ok" | "warn" | "no") =>
    s === "ok" ? { ch: "✓", color: "#1D9E75" } : s === "warn" ? { ch: "⚠", color: "#EF9F27" } : { ch: "✗", color: "#E24B4A" };

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-[12px] font-semibold text-foreground">
        Compatibilidade perfil × alavancagem
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium px-4 py-2">Perfil</th>
              {levs.map((l) => (<th key={l} className="px-2 py-2 font-medium tabular-nums">{l}x</th>))}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-2 text-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: p.color }} />
                    {p.name}
                  </span>
                </td>
                {levs.map((l) => {
                  const s = sym(p.levMatrix[l]);
                  return (
                    <td key={l} className="px-2 py-2 text-center">
                      <span style={{ color: s.color }}>{s.ch}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PromptInjection() {
  const active = useBot4xStore((s) => s.profile);
  const p = PROFILES[active];
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const block = `// Bot4x v2.0 — prompt injection (profile: ${p.id})
PROFILE = "${p.name}"
RSI_BUY_MAX   = ${p.rsiBuy}
RSI_SELL_MIN  = ${p.rsiSell}
AI_SCORE_MIN  = ${p.aiScore}
FOMO_MAX      = ${p.fomo}
RISK_RANK     = ${p.riskRank}/4
EXPECTED_WR   = ~${p.wr}%

GUARDRAILS:
  - DEMO mode default; REAL requires operator confirmation
  - daily circuit breaker -1.5% (= 3 SLs)
  - trailing lock activates +4% peak, locks at +3%
  - max 3 concurrent slots; slot = activeCapital / 3`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(block); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-[12px] font-medium text-foreground hover:bg-secondary/30"
      >
        <span>Prompt injection do perfil ativo</span>
        <span className="text-[10px] text-muted-foreground">{open ? "Ocultar" : "Mostrar"}</span>
      </button>
      {open && (
        <div className="border-t border-border p-3">
          <div className="relative">
            <pre className="font-mono text-[11px] leading-relaxed text-foreground/85 bg-background border border-border rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{block}</pre>
            <button
              onClick={copy}
              className="absolute top-2 right-2 inline-flex items-center gap-1 h-7 px-2 rounded-md bg-secondary text-foreground text-[11px] hover:bg-secondary/70"
            >
              {copied ? <Check className="size-3.5 text-[#1D9E75]" /> : <Copy className="size-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
