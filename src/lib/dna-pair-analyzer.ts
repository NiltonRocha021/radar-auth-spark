// DNA Pair Analyzer — analyzes Bot4x trade history per pair, detects
// 3 consecutive wins / losses streaks, infers trend + volume strength,
// and produces a ranking of pairs Bot4x should prefer or avoid.
//
// Pure function over the Bot4x store history. UI consumes the result
// and (optionally) writes preferred/avoid lists back into the store so
// the execution engine biases new orders toward winners.

import type { Trade } from "./bot4x-data";

export type PairTrend = "UP" | "DOWN" | "FLAT";

export type PairAnalysis = {
  pair: string;
  total: number; // trades volume on this pair (last N)
  wins: number;
  losses: number;
  winRate: number; // 0..100
  pnlSum: number; // % cumulative
  streak: number; // signed: +N consecutive wins, -N consecutive losses
  trend: PairTrend; // last 5 trades trend direction
  volumeScore: number; // 0..100 relative to busiest pair
  recommendation: "PREFER" | "AVOID" | "NEUTRAL";
  reason: string;
};

export type PairAnalysisResult = {
  analyses: PairAnalysis[];
  preferred: string[]; // 3 consecutive wins, positive trend & solid volume
  avoid: string[]; // 3 consecutive losses
  generatedAt: number;
};

function countStreak(trades: Trade[]): number {
  // trades expected newest-first; returns +N if last N are WIN, -N if LOSS
  if (!trades.length) return 0;
  const first = trades[0].result;
  if (first !== "WIN" && first !== "LOSS") return 0;
  let n = 0;
  for (const t of trades) {
    if (t.result === first) n++;
    else break;
  }
  return first === "WIN" ? n : -n;
}

function trendOf(trades: Trade[]): PairTrend {
  // sum pnlPct over last 5 trades (already newest-first)
  const last5 = trades.slice(0, 5);
  const sum = last5.reduce((acc, t) => acc + (t.pnlPct ?? 0), 0);
  if (sum > 0.3) return "UP";
  if (sum < -0.3) return "DOWN";
  return "FLAT";
}

export function analyzePairs(history: Trade[]): PairAnalysisResult {
  // assume history is newest-first (Bot4x store keeps it that way for last 5);
  // if not, sort defensively by id timestamp embedded in id (`o_<ts>`).
  const sorted = [...history].sort((a, b) => {
    const ta = Number((a.id.match(/^o_(\d+)/) ?? [])[1] ?? 0);
    const tb = Number((b.id.match(/^o_(\d+)/) ?? [])[1] ?? 0);
    return tb - ta;
  });

  // group by pair
  const byPair = new Map<string, Trade[]>();
  for (const t of sorted) {
    if (t.result !== "WIN" && t.result !== "LOSS") continue;
    const arr = byPair.get(t.pair) ?? [];
    arr.push(t);
    byPair.set(t.pair, arr);
  }

  const maxVol = Math.max(1, ...Array.from(byPair.values()).map((a) => a.length));

  const analyses: PairAnalysis[] = [];
  for (const [pair, trades] of byPair) {
    const wins = trades.filter((t) => t.result === "WIN").length;
    const losses = trades.filter((t) => t.result === "LOSS").length;
    const total = wins + losses;
    const winRate = total ? Math.round((wins / total) * 100) : 0;
    const pnlSum = +trades.reduce((acc, t) => acc + (t.pnlPct ?? 0), 0).toFixed(2);
    const streak = countStreak(trades);
    const trend = trendOf(trades);
    const volumeScore = Math.round((total / maxVol) * 100);

    let recommendation: PairAnalysis["recommendation"] = "NEUTRAL";
    let reason = "Sem padrão definido";

    if (streak <= -3) {
      recommendation = "AVOID";
      reason = `${-streak} perdas consecutivas · tendência ${trend}`;
    } else if (streak >= 3 && trend !== "DOWN" && volumeScore >= 30) {
      recommendation = "PREFER";
      reason = `${streak} vitórias consecutivas · tendência ${trend} · volume ${volumeScore}%`;
    } else if (winRate >= 65 && total >= 5 && trend === "UP") {
      recommendation = "PREFER";
      reason = `WR ${winRate}% · tendência UP · ${total} trades`;
    } else if (winRate <= 30 && total >= 5) {
      recommendation = "AVOID";
      reason = `WR ${winRate}% · ${losses}/${total} negativos`;
    } else {
      reason = `WR ${winRate}% · streak ${streak >= 0 ? "+" : ""}${streak} · ${trend}`;
    }

    analyses.push({
      pair,
      total,
      wins,
      losses,
      winRate,
      pnlSum,
      streak,
      trend,
      volumeScore,
      recommendation,
      reason,
    });
  }

  // sort: PREFER first by pnlSum desc, then AVOID last
  analyses.sort((a, b) => {
    const rank = (r: PairAnalysis["recommendation"]) =>
      r === "PREFER" ? 0 : r === "NEUTRAL" ? 1 : 2;
    const dr = rank(a.recommendation) - rank(b.recommendation);
    if (dr !== 0) return dr;
    return b.pnlSum - a.pnlSum;
  });

  return {
    analyses,
    preferred: analyses.filter((a) => a.recommendation === "PREFER").map((a) => a.pair),
    avoid: analyses.filter((a) => a.recommendation === "AVOID").map((a) => a.pair),
    generatedAt: Date.now(),
  };
}
