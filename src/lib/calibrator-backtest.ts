// Backtest determinístico sobre candles reais da Binance.
// Cada perfil implementa uma estratégia simples; alavancagem multiplica o retorno por trade.
import type { Candle } from "./market-data";
import type {
  BackendSimulationResponse,
  BackendSimulationPoint,
  SimulationProfile,
} from "@/adapters/backend/calibrator.adapter";

function sma(values: number[], i: number, period: number): number | null {
  if (i + 1 < period) return null;
  let s = 0;
  for (let k = i - period + 1; k <= i; k++) s += values[k];
  return s / period;
}

function rsi(values: number[], i: number, period = 14): number | null {
  if (i < period) return null;
  let gains = 0;
  let losses = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const diff = values[k] - values[k - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

interface StrategyContext {
  closes: number[];
  i: number;
}
type Signal = "LONG" | "SHORT" | "FLAT";

function strategyConservador({ closes, i }: StrategyContext): Signal {
  const fast = sma(closes, i, 20);
  const slow = sma(closes, i, 50);
  if (fast == null || slow == null) return "FLAT";
  return fast > slow ? "LONG" : "FLAT";
}

function strategyRsi({ closes, i }: StrategyContext): Signal {
  const r = rsi(closes, i, 14);
  if (r == null) return "FLAT";
  if (r < 30) return "LONG";
  if (r > 70) return "SHORT";
  return "FLAT";
}

function strategyAiScore({ closes, i }: StrategyContext): Signal {
  const fast = sma(closes, i, 10);
  const slow = sma(closes, i, 30);
  const r = rsi(closes, i, 14);
  if (fast == null || slow == null || r == null) return "FLAT";
  const trend = fast > slow ? 1 : -1;
  const momentum = r > 55 ? 1 : r < 45 ? -1 : 0;
  const score = trend + momentum;
  if (score >= 2) return "LONG";
  if (score <= -2) return "SHORT";
  return "FLAT";
}

function strategyAgressivo({ closes, i }: StrategyContext): Signal {
  if (i < 3) return "FLAT";
  const mom = (closes[i] - closes[i - 3]) / closes[i - 3];
  if (mom > 0.005) return "LONG";
  if (mom < -0.005) return "SHORT";
  return "FLAT";
}

const STRATEGIES: Record<SimulationProfile, (ctx: StrategyContext) => Signal> = {
  conservador: strategyConservador,
  rsi: strategyRsi,
  aiscore: strategyAiScore,
  agressivo: strategyAgressivo,
};

export interface BacktestParams {
  profile: SimulationProfile;
  symbol: string;
  candles: Candle[];
  initialBalance: number;
  leverage: number;
  /** Taxa por trade (entrada+saída) — ex. 0.0008 = 0.08%. */
  feePerTrade?: number;
}

export function runBacktest(p: BacktestParams): BackendSimulationResponse {
  const fee = p.feePerTrade ?? 0.0008;
  const leverage = Math.max(1, Math.min(125, p.leverage || 1));
  const closes = p.candles.map((c) => c.close);
  const strat = STRATEGIES[p.profile];

  let equity = p.initialBalance;
  let peak = equity;
  let maxDd = 0;
  let wins = 0;
  let losses = 0;
  let liquidated = false;
  let liquidatedAt: string | null = null;
  let position: Signal = "FLAT";
  let entryPrice = 0;
  const equity_curve: BackendSimulationPoint[] = [];

  const closeTrade = (exitPrice: number) => {
    if (position === "FLAT") return;
    const direction = position === "LONG" ? 1 : -1;
    const rawRet = ((exitPrice - entryPrice) / entryPrice) * direction;
    const leveragedRet = rawRet * leverage - fee;
    const newEquity = equity * (1 + leveragedRet);
    if (newEquity <= 0) {
      equity = 0;
      liquidated = true;
      losses++;
    } else {
      equity = newEquity;
      if (leveragedRet >= 0) wins++;
      else losses++;
    }
    position = "FLAT";
    entryPrice = 0;
  };

  for (let i = 0; i < p.candles.length; i++) {
    const c = p.candles[i];
    const ts = new Date(c.closeTime).toISOString();

    if (!liquidated) {
      // Risco de liquidação intra-candle (com base no pior preço do candle)
      if (position !== "FLAT") {
        const worst = position === "LONG" ? c.low : c.high;
        const adverseMove = position === "LONG"
          ? (worst - entryPrice) / entryPrice
          : (entryPrice - worst) / entryPrice;
        const adverseLeveraged = adverseMove * leverage;
        if (adverseLeveraged <= -1) {
          // liquidação total
          equity = 0;
          losses++;
          position = "FLAT";
          entryPrice = 0;
          liquidated = true;
          liquidatedAt = ts;
        }
      }

      if (!liquidated) {
        const sig = strat({ closes, i });
        if (sig !== position) {
          // fecha posição atual e abre nova (se houver sinal direcional)
          if (position !== "FLAT") closeTrade(c.close);
          if (sig !== "FLAT" && equity > 0) {
            position = sig;
            entryPrice = c.close;
          }
        }
      }
    }

    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 1;
    if (dd > maxDd) maxDd = dd;
    equity_curve.push({ t: ts, equity: Number(equity.toFixed(2)) });
  }

  // fecha última posição
  if (!liquidated && position !== "FLAT" && p.candles.length > 0) {
    closeTrade(p.candles[p.candles.length - 1].close);
    if (equity_curve.length > 0) {
      equity_curve[equity_curve.length - 1] = {
        t: equity_curve[equity_curve.length - 1].t,
        equity: Number(equity.toFixed(2)),
      };
    }
  }

  const trades = wins + losses;
  const pnl = equity - p.initialBalance;
  const pnl_pct = (pnl / p.initialBalance) * 100;
  const win_rate = trades ? wins / trades : 0;
  // Sharpe simples baseado em retornos da curva
  const rets: number[] = [];
  for (let i = 1; i < equity_curve.length; i++) {
    const prev = equity_curve[i - 1].equity;
    if (prev > 0) rets.push((equity_curve[i].equity - prev) / prev);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(rets.length, 1);
  const variance =
    rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(rets.length - 1, 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? Number(((mean / std) * Math.sqrt(rets.length)).toFixed(2)) : 0;

  const profileLabels: Record<SimulationProfile, string> = {
    conservador: "Tendência (SMA 20/50)",
    rsi: "Reversão por RSI(14)",
    aiscore: "Score composto SMA+RSI",
    agressivo: "Momentum curto prazo",
  };

  const commentary = liquidated
    ? `LIQUIDADO em ${liquidatedAt} — alavancagem ${leverage}× ${p.profile} em ${p.symbol}`
    : `Real Binance ${p.symbol} • ${p.candles.length} candles • alavancagem ${leverage}× • ${profileLabels[p.profile]}`;

  return {
    trades,
    wins,
    losses,
    win_rate: Number(win_rate.toFixed(4)),
    pnl: Number(pnl.toFixed(2)),
    pnl_pct: Number(pnl_pct.toFixed(2)),
    max_drawdown: Number(maxDd.toFixed(4)),
    sharpe,
    equity_curve,
    dna_feedback: liquidated
      ? {
          pattern_detected: `Liquidação com alavancagem ${leverage}×`,
          correction: "Reduzir alavancagem ou ajustar stops",
          expected_improvement: "Sobrevivência do capital + drawdown menor",
        }
      : {
          pattern_detected: `${profileLabels[p.profile]} • win rate ${(win_rate * 100).toFixed(1)}%`,
          correction:
            win_rate < 0.5
              ? "Refinar gatilho de entrada — taxa de acerto baixa"
              : pnl < 0
              ? "Reduzir tamanho de posição ou alavancagem"
              : "Manter parâmetros — desempenho positivo",
          expected_improvement:
            pnl >= 0 ? "Ajustes finos podem aumentar Sharpe" : "Melhora esperada de PnL com correção",
        },
    commentary,
  };
}
