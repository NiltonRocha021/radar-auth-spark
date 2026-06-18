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

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useBot4xStore } from "./bot4x-store";
import { useSignalsStore } from "./signals-store";
import type { CalibProfile } from "./bot4x-data";

// Profile risk ladder (safest → riskiest). Auto-corrector walks LEFT under stress.
const PROFILE_LADDER: CalibProfile[] = [
  "conservador",
  "rsi",
  "aiscore",
  "swing",
  "position",
  "intraday",
  "scalper",
  "agressivo",
];

function saferProfile(p: CalibProfile): CalibProfile | null {
  const idx = PROFILE_LADDER.indexOf(p);
  if (idx <= 0) return null;
  return PROFILE_LADDER[idx - 1];
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
  const openLossPct = s.orders
    .filter((o) => o.pnlPct < 0)
    .reduce((acc, o) => acc + o.pnlPct, 0);
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

export function runDnaAutoCorrection(): CorrectionLog | null {
  const snap = readSnapshot();
  const bot4x = useBot4xStore.getState();
  const signals = useSignalsStore.getState();

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

  // 1) Profile degradation (tier ≥ 2 swaps to safer profile)
  if (tier >= 2 && canApply("profile")) {
    const next = saferProfile(bot4x.profile);
    if (next && next !== bot4x.profile) {
      const prev = bot4x.profile;
      bot4x.setProfile(next);
      changes.push(`Perfil: ${prev} → ${next}`);
      markApplied("profile");
    }
  }

  // 2) Calibrator parameters
  if (canApply("calib")) {
    let touched = false;
    // Reduce leverage by 1 step (min 1) starting at tier 1
    if (bot4x.leverage > 1) {
      const nextLev = Math.max(1, bot4x.leverage - 1);
      bot4x.setLeverage(nextLev);
      changes.push(`Alavancagem: ${bot4x.leverage}× → ${nextLev}×`);
      touched = true;
    }
    // Reduce allocation by 5% (min 10%) starting at tier 2
    if (tier >= 2 && bot4x.allocationPct > 10) {
      const nextAlloc = Math.max(10, bot4x.allocationPct - 5);
      bot4x.setAllocationPct(nextAlloc);
      changes.push(`Alocação: ${bot4x.allocationPct}% → ${nextAlloc}%`);
      touched = true;
    }
    if (touched) markApplied("calib");
  }

  // 3) Signal filters (raise scoreMin tier, force bot4xOnly)
  if (canApply("filters")) {
    let touched = false;
    const tiers: Array<0 | 60 | 75 | 90> = [0, 60, 75, 90];
    const curIdx = tiers.indexOf(signals.filters.scoreMin);
    if (curIdx < tiers.length - 1) {
      const nextScore = tiers[Math.min(tiers.length - 1, curIdx + 1)];
      signals.setFilter("scoreMin", nextScore);
      changes.push(`Score min: ${signals.filters.scoreMin} → ${nextScore}`);
      touched = true;
    }
    if (tier >= 2 && !signals.filters.bot4xOnly) {
      signals.setFilter("bot4xOnly", true);
      changes.push("Filtro 'Apenas Bot4x' ativado");
      touched = true;
    }
    if (touched) markApplied("filters");
  }

  if (changes.length === 0) return null;

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
