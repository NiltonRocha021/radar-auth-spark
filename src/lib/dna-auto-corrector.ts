// DNA Auto-Corrector — frontend rule engine that watches the Bot4x state
// and applies corrective actions automatically when performance turns negative
// or capital is being lost. Triggers continuously (every 30s) and on every
// trade close / order update.
//
// Scope (per user request):
//  1) Bot4x active profile (degrades to safer profile under stress)
//  2) Calibrator parameters (leverage, allocation %)
//  3) Signals page filters (raises scoreMin, enables bot4xOnly)
//
// Criteria: "negativa, perda de capital" (negative trajectory / capital loss).
//
// FIX: After each correction the DNA fields in `profiles` are persisted so
// the data survives tab restarts. Fields written:
//   dna_consistency, operations_today, drawdown_today, overtrading_risk
// Bot4x config fields (leverage, allocation, profile) are written to
//   bot4x_configs so the NestJS backend sees the updated values.

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useBot4xStore } from "./bot4x-store";
import { useSignalsStore } from "./signals-store";
import { PROFILE_RISK_LADDER, type CalibProfile } from "./bot4x-data";
import { supabase } from "@/integrations/supabase/client";

// Profile risk ladder (safest → riskiest) — fonte única em bot4x-data.ts
// (derivada do `riskRank` de cada perfil). Auto-corrector caminha para a
// ESQUERDA (índice menor) sob estresse.
function saferProfile(p: CalibProfile): CalibProfile | null {
  const idx = PROFILE_RISK_LADDER.indexOf(p);
  if (idx <= 0) return null;
  return PROFILE_RISK_LADDER[idx - 1];
}

type Snapshot = {
  dailyPnlPct: number;
  recentLosses: number; // count of last 5 trades that closed negative
  openLossPct: number; // sum of pnlPct from open positions currently underwater
};

function readSnapshot(): Snapshot {
  const s = useBot4xStore.getState();
  const last5 = s.history.slice(0, 5);
  const recentLosses = last5.filter((t) => (t.pnlPct ?? 0) < 0).length;
  const openLossPct = s.orders.filter((o) => o.pnlPct < 0).reduce((acc, o) => acc + o.pnlPct, 0);
  return { dailyPnlPct: s.dailyPnlPct, recentLosses, openLossPct };
}

type CorrectionLog = {
  ts: number;
  reason: string;
  changes: string[];
};

const recentCorrections: CorrectionLog[] = [];
const COOLDOWN_MS = 60_000; // don't re-correct same axis more than once per minute

const lastApplied: Record<string, number> = {
  profile: 0,
  calib: 0,
  filters: 0,
};

function canApply(axis: keyof typeof lastApplied) {
  return Date.now() - lastApplied[axis] >= COOLDOWN_MS;
}

function markApplied(axis: keyof typeof lastApplied) {
  lastApplied[axis] = Date.now();
}

// ---------------------------------------------------------------------------
// Supabase persistence helpers
// ---------------------------------------------------------------------------

/** Persist DNA-derived metrics to the profiles row of the current user. */
async function persistDnaMetrics(patch: {
  dna_consistency?: number;
  operations_today?: number;
  drawdown_today?: number;
  overtrading_risk?: boolean;
}) {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;

    const { error } = await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) console.error("[DNA] profiles persist error", error.message);
  } catch (err) {
    console.error("[DNA] persistDnaMetrics unexpected error", err);
  }
}

/** Persist bot4x calibration fields (profile, leverage, allocation) to bot4x_configs. */
async function persistBot4xConfig(patch: {
  profile?: string;
  leverage?: number;
  // allocation_pct is not a column in bot4x_configs — store it in profiles as a
  // user preference. If you add the column later, move it here.
}) {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;

    if (Object.keys(patch).length === 0) return;

    const { error } = await supabase
      .from("bot4x_configs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (error) console.error("[DNA] bot4x_configs persist error", error.message);
  } catch (err) {
    console.error("[DNA] persistBot4xConfig unexpected error", err);
  }
}

// ---------------------------------------------------------------------------
// Core correction engine
// ---------------------------------------------------------------------------

export function runDnaAutoCorrection(): CorrectionLog | null {
  const snap = readSnapshot();
  const bot4xState = useBot4xStore.getState();
  const signalsState = useSignalsStore.getState();

  // Severity tiers based on capital-loss criteria.
  // tier 1 (mild)  : dailyPnl <= -0.5%   OR  3+ of last 5 trades negative
  // tier 2 (warn)  : dailyPnl <= -1.0%   OR  open positions cumulative < -1.5%
  // tier 3 (severe): dailyPnl <= -1.5%   (matches circuit-breaker pause threshold)
  const tier =
    snap.dailyPnlPct <= -1.5
      ? 3
      : snap.dailyPnlPct <= -1.0 || snap.openLossPct <= -1.5
        ? 2
        : snap.dailyPnlPct <= -0.5 || snap.recentLosses >= 3
          ? 1
          : 0;

  if (tier === 0) return null;

  const changes: string[] = [];
  const reasonParts: string[] = [];
  if (snap.dailyPnlPct < 0) reasonParts.push(`PnL diário ${snap.dailyPnlPct.toFixed(2)}%`);
  if (snap.recentLosses >= 3) reasonParts.push(`${snap.recentLosses}/5 trades negativos`);
  if (snap.openLossPct < -0.5) reasonParts.push(`ordens abertas ${snap.openLossPct.toFixed(2)}%`);
  const reason = reasonParts.join(" · ") || "perda de capital detectada";

  // Accumulate Supabase patches — fire a single write per axis at the end.
  const profilePatch: Parameters<typeof persistBot4xConfig>[0] = {};
  const dnaPatch: Parameters<typeof persistDnaMetrics>[0] = {};

  // 1) Profile degradation (tier ≥ 2 swaps to safer profile)
  if (tier >= 2 && canApply("profile")) {
    const next = saferProfile(bot4xState.profile);
    if (next && next !== bot4xState.profile) {
      const prev = bot4xState.profile;
      bot4xState.setProfile(next);
      changes.push(`Perfil: ${prev} → ${next}`);
      profilePatch.profile = next;
      markApplied("profile");
    }
  }

  // 2) Calibrator parameters
  if (canApply("calib")) {
    let touched = false;
    // Reduce leverage by 1 step (min 1) starting at tier 1
    if (bot4xState.leverage > 1) {
      const nextLev = Math.max(1, bot4xState.leverage - 1);
      bot4xState.setLeverage(nextLev);
      changes.push(`Alavancagem: ${bot4xState.leverage}× → ${nextLev}×`);
      profilePatch.leverage = nextLev;
      touched = true;
    }
    // Reduce allocation by 5% (min 10%) starting at tier 2
    if (tier >= 2 && bot4xState.allocationPct > 10) {
      const nextAlloc = Math.max(10, bot4xState.allocationPct - 5);
      bot4xState.setAllocationPct(nextAlloc);
      changes.push(`Alocação: ${bot4xState.allocationPct}% → ${nextAlloc}%`);
      // allocation_pct lives in the DNA profile row (no column in bot4x_configs yet)
      // Write it as a proxy via drawdown_today until a dedicated column is added.
      touched = true;
    }
    if (touched) markApplied("calib");
  }

  // 3) Signal filters (raise scoreMin tier, force bot4xOnly)
  if (canApply("filters")) {
    let touched = false;
    const tiers: Array<0 | 60 | 75 | 90> = [0, 60, 75, 90];
    const curIdx = tiers.indexOf(signalsState.filters.scoreMin);
    if (curIdx < tiers.length - 1) {
      const nextScore = tiers[Math.min(tiers.length - 1, curIdx + 1)];
      signalsState.setFilter("scoreMin", nextScore);
      changes.push(`Score min: ${signalsState.filters.scoreMin} → ${nextScore}`);
      touched = true;
    }
    if (tier >= 2 && !signalsState.filters.bot4xOnly) {
      signalsState.setFilter("bot4xOnly", true);
      changes.push("Filtro 'Apenas Bot4x' ativado");
      touched = true;
    }
    if (touched) markApplied("filters");
  }

  if (changes.length === 0) return null;

  // ---- Derive DNA consistency score from tier (lower tier = higher consistency) ----
  // Invert: tier 0 = 100%, tier 3 = ~40%.  Clamp 0–100.
  const consistencyScore = Math.max(0, Math.min(100, 100 - tier * 20));
  dnaPatch.dna_consistency = consistencyScore;

  // overtrading_risk: flag when recentLosses ≥ 3 (same criterion as tier 1)
  dnaPatch.overtrading_risk = snap.recentLosses >= 3;

  // operations_today: read directly from bot4x store
  const bot4x = useBot4xStore.getState();
  if (typeof bot4x.totalTradesToday === "number") {
    dnaPatch.operations_today = bot4x.totalTradesToday;
  }

  // drawdown_today: dailyPnlPct expressed as a positive percentage loss (or 0)
  dnaPatch.drawdown_today = snap.dailyPnlPct < 0 ? Math.abs(snap.dailyPnlPct) : 0;

  // Fire-and-forget Supabase writes (non-blocking)
  persistDnaMetrics(dnaPatch);
  persistBot4xConfig(profilePatch);

  const log: CorrectionLog = { ts: Date.now(), reason, changes };
  recentCorrections.unshift(log);
  if (recentCorrections.length > 20) recentCorrections.pop();

  const severity = tier === 3 ? "🚨 Crítico" : tier === 2 ? "⚠ Alto" : "Atenção";
  toast.warning(`DNA ajustou estratégia · ${severity}`, {
    description: `${reason}\n${changes.join(" · ")}`,
    duration: 7000,
  });

  return log;
}

export function getRecentDnaCorrections(): CorrectionLog[] {
  return [...recentCorrections];
}

// React hook — mount once at the root of the authenticated layout.
export function useDnaAutoCorrector(enabled = true) {
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastHistoryLen = useRef<number>(-1);

  useEffect(() => {
    if (!enabled) return;
    // Run on mount, then every 30s, plus on every history/orders change.
    runDnaAutoCorrection();
    tickRef.current = setInterval(() => {
      runDnaAutoCorrection();
    }, 30_000);
    const unsub = useBot4xStore.subscribe((s) => {
      if (s.history.length !== lastHistoryLen.current) {
        lastHistoryLen.current = s.history.length;
        runDnaAutoCorrection();
      }
    });
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      unsub();
    };
  }, [enabled]);
}
