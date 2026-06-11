import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/dashboard/top-bar";
import { LeftSidebar } from "@/components/dashboard/left-sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import {
  calibratorAdapter,
  type SimulationProfile,
  type SimulationResultUI,
} from "@/adapters/backend/calibrator.adapter";
import { TOP_20_USDT_PAIRS } from "@/lib/market-data";
import { recordSimulation } from "@/lib/calibrator-history-store";
import { FlaskConical, Loader2, TrendingUp, TrendingDown, Activity, AlertCircle, History, Zap } from "lucide-react";

const VALID_PROFILES: SimulationProfile[] = ["conservador", "rsi", "aiscore", "agressivo"];

type CalibratorSearch = {
  profile?: SimulationProfile;
  symbol?: string;
  period_days?: number;
  initial_balance?: number;
  leverage?: number;
  autorun?: number;
};

export const Route = createFileRoute("/_authenticated/calibrator")({
  head: () => ({
    meta: [
      { title: "Calibrator — AISignalRadar" },
      { name: "description", content: "Run historical backtests to calibrate your trading DNA via the Bot4x Calibration Engine." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): CalibratorSearch => {
    const rawProfile = typeof search.profile === "string" ? search.profile : undefined;
    const profile = rawProfile && (VALID_PROFILES as string[]).includes(rawProfile)
      ? (rawProfile as SimulationProfile)
      : undefined;
    const symbol = typeof search.symbol === "string" ? search.symbol : undefined;
    const periodDaysNum = Number(search.period_days);
    const period_days = Number.isFinite(periodDaysNum) && periodDaysNum > 0 ? periodDaysNum : undefined;
    const balanceNum = Number(search.initial_balance);
    const initial_balance = Number.isFinite(balanceNum) && balanceNum > 0 ? balanceNum : undefined;
    const leverageNum = Number(search.leverage);
    const leverage = Number.isFinite(leverageNum) && leverageNum >= 1 ? leverageNum : undefined;
    const autorunNum = Number(search.autorun);
    const autorun = Number.isFinite(autorunNum) && autorunNum > 0 ? 1 : undefined;
    return { profile, symbol, period_days, initial_balance, leverage, autorun };
  },
  component: CalibratorPage,
});

const PROFILES: { value: SimulationProfile; label: string }[] = [
  { value: "conservador", label: "Conservador" },
  { value: "rsi", label: "RSI" },
  { value: "aiscore", label: "AI Score" },
  { value: "agressivo", label: "Agressivo" },
];

function CalibratorPage() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<SimulationProfile>(search.profile ?? "rsi");
  const [symbol, setSymbol] = useState(search.symbol ?? "BTCUSDT");
  const [periodDays, setPeriodDays] = useState(search.period_days ?? 30);
  const [initialBalance, setInitialBalance] = useState(search.initial_balance ?? 10000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResultUI | null>(null);
  const autorunHandledRef = useRef(false);

  async function runSimulation() {
    if (!user?.id) {
      setError("Usuário não autenticado.");
      return;
    }
    setLoading(true);
    setError(null);
    const params = {
      profile,
      symbol: symbol.trim().toUpperCase(),
      periodDays,
      initialBalance,
    };
    try {
      const res = await calibratorAdapter.simulate(user.id, {
        profile: params.profile,
        symbol: params.symbol,
        period_days: params.periodDays,
        initial_balance: params.initialBalance,
      });
      setResult(res);
      recordSimulation(user.id, params, res);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? "Falha ao executar simulação.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autorunHandledRef.current) return;
    if (search.autorun && user?.id) {
      autorunHandledRef.current = true;
      runSimulation();
      // limpa a flag da URL para não reexecutar em refresh
      navigate({
        to: "/calibrator",
        search: {
          profile: search.profile,
          symbol: search.symbol,
          period_days: search.period_days,
          initial_balance: search.initial_balance,
        },
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.autorun, user?.id]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <div className="flex">
        <LeftSidebar />
        <main className="flex-1 min-w-0 p-5 space-y-5">
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <FlaskConical className="size-6 text-primary" />
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Calibrator</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Backtest histórico de perfis para calibrar o DNA via Bot4x Calibration Engine.
                </p>
              </div>
            </div>
            <Link to="/calibrator/history">
              <Button variant="outline" size="sm">
                <History className="size-4 mr-2" /> Histórico
              </Button>
            </Link>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Form */}
            <Card className="p-5 lg:col-span-1 space-y-4">
              <h2 className="text-sm font-semibold">Configuração da simulação</h2>

              <div className="space-y-2">
                <Label htmlFor="profile">Perfil</Label>
                <Select value={profile} onValueChange={(v) => setProfile(v as SimulationProfile)}>
                  <SelectTrigger id="profile">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFILES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="symbol">Símbolo</Label>
                <Input
                  id="symbol"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="BTCUSDT"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="period">Período (dias)</Label>
                <Input
                  id="period"
                  type="number"
                  min={1}
                  max={365}
                  value={periodDays}
                  onChange={(e) => setPeriodDays(Number(e.target.value) || 1)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="balance">Saldo inicial (USDT)</Label>
                <Input
                  id="balance"
                  type="number"
                  min={100}
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(Number(e.target.value) || 100)}
                />
              </div>

              <Button onClick={runSimulation} disabled={loading} className="w-full">
                {loading ? (
                  <><Loader2 className="size-4 mr-2 animate-spin" /> Executando…</>
                ) : (
                  <><FlaskConical className="size-4 mr-2" /> Rodar simulação</>
                )}
              </Button>

              {error && (
                <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
                  <AlertCircle className="size-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </Card>

            {/* Results */}
            <div className="lg:col-span-2 space-y-5">
              {!result && !loading && (
                <Card className="p-10 text-center text-sm text-muted-foreground">
                  Configure os parâmetros à esquerda e execute uma simulação para visualizar os resultados.
                </Card>
              )}

              {loading && (
                <Card className="p-10 flex items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                  Executando backtest no Calibrador…
                </Card>
              )}

              {result && !loading && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Metric label="Trades" value={String(result.trades)} icon={<Activity className="size-4" />} />
                    <Metric label="Win Rate" value={`${(result.winRate * 100).toFixed(1)}%`} tone={result.winRate >= 0.5 ? "pos" : "neg"} />
                    <Metric
                      label="PnL"
                      value={`${result.pnl >= 0 ? "+" : ""}${result.pnl.toFixed(2)} (${result.pnlPct.toFixed(2)}%)`}
                      tone={result.pnl >= 0 ? "pos" : "neg"}
                      icon={result.pnl >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                    />
                    <Metric label="Max Drawdown" value={`${(result.maxDrawdown * 100).toFixed(2)}%`} tone="neg" />
                  </div>

                  <Card className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">Equity curve</h3>
                      <span className="text-xs text-muted-foreground">{result.equityCurve.length} pontos</span>
                    </div>
                    <EquitySparkline points={result.equityCurve} />
                  </Card>

                  {(result.commentary || result.dnaFeedback.patternDetected) && (
                    <Card className="p-5 space-y-3">
                      <h3 className="text-sm font-semibold">DNA feedback</h3>
                      {result.dnaFeedback.patternDetected && (
                        <Row k="Padrão detectado" v={result.dnaFeedback.patternDetected} />
                      )}
                      {result.dnaFeedback.correction && (
                        <Row k="Correção sugerida" v={result.dnaFeedback.correction} />
                      )}
                      {result.dnaFeedback.expectedImprovement && (
                        <Row k="Melhoria esperada" v={result.dnaFeedback.expectedImprovement} />
                      )}
                      {result.commentary && (
                        <p className="text-xs text-muted-foreground border-t border-border pt-3">{result.commentary}</p>
                      )}
                    </Card>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  icon?: React.ReactNode;
}) {
  const color = tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-rose-500" : "text-foreground";
  return (
    <Card className="p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon}{label}
      </div>
      <div className={`text-lg font-semibold mt-1 ${color}`}>{value}</div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{k}: </span>
      <span className="text-foreground">{v}</span>
    </div>
  );
}

function EquitySparkline({ points }: { points: { t: string; equity: number }[] }) {
  if (!points.length) {
    return <div className="text-xs text-muted-foreground">Sem dados de equity.</div>;
  }
  const w = 600;
  const h = 140;
  const pad = 4;
  const values = points.map((p) => p.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / Math.max(points.length - 1, 1);
  const path = points
    .map((p, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((p.equity - min) / range) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const positive = points[points.length - 1].equity >= points[0].equity;
  const stroke = positive ? "rgb(16 185 129)" : "rgb(244 63 94)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
}
