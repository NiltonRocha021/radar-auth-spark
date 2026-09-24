import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bell, BellOff, ShieldCheck } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getPairAnalytics, getRiskByPair } from "@/lib/orders.functions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AsyncState, EmptyState } from "@/components/common/async-state";

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function playRiskTone() {
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(720, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(420, context.currentTime + 0.28);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.34);
  oscillator.addEventListener("ended", () => void context.close());
}

export function LiveRiskPanel() {
  const riskFn = useServerFn(getRiskByPair);
  const analyticsFn = useServerFn(getPairAnalytics);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const lastAlertKey = useRef("");
  const riskQuery = useQuery({
    queryKey: ["orders", "risk", "LIVE"],
    queryFn: () => riskFn({ data: { mode: "LIVE" } }),
    refetchInterval: 15_000,
  });
  const analyticsQuery = useQuery({
    queryKey: ["orders", "pairs", "LIVE"],
    queryFn: () => analyticsFn({ data: { mode: "LIVE", limit: 1000 } }),
    refetchInterval: 15_000,
  });

  const risk = riskQuery.data;
  const financialAlert = !!risk && (risk.balance < 0 || risk.drawdown > 0);
  const alertKey = risk
    ? `${risk.balance < 0 ? risk.balance.toFixed(2) : "ok"}:${risk.drawdown > 0 ? risk.drawdown.toFixed(2) : "peak"}`
    : "";

  useEffect(() => {
    if (!financialAlert || !soundEnabled || !alertKey || alertKey === lastAlertKey.current) return;
    lastAlertKey.current = alertKey;
    playRiskTone();
  }, [alertKey, financialAlert, soundEnabled]);

  const chartData = useMemo(
    () =>
      (analyticsQuery.data?.equityCurve ?? []).map((point) => ({
        time: new Date(point.t).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        balance: Number(point.cum.toFixed(2)),
        order: Number(point.pnl.toFixed(2)),
        symbol: point.symbol,
      })),
    [analyticsQuery.data],
  );

  return (
    <section className="space-y-4" aria-labelledby="live-risk-title">
      {financialAlert && risk && (
        <Alert variant="destructive" className="bg-destructive/10 pr-14 motion-safe:animate-pulse">
          <AlertTriangle aria-hidden />
          <AlertTitle>Alerta financeiro LIVE</AlertTitle>
          <AlertDescription>
            {risk.balance < 0 && <p>Saldo realizado em zona de perda: {money(risk.balance)}.</p>}
            {risk.drawdown > 0 && (
              <p>
                Queda de {money(risk.drawdown)} ({risk.drawdownPct.toFixed(1)}%) desde o melhor saldo de {money(risk.peakBalance)}.
              </p>
            )}
          </AlertDescription>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2"
                  onClick={() => setSoundEnabled((enabled) => !enabled)}
                  aria-label={soundEnabled ? "Silenciar alertas financeiros" : "Ativar som dos alertas financeiros"}
                >
                  {soundEnabled ? <Bell aria-hidden /> : <BellOff aria-hidden />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{soundEnabled ? "Silenciar alertas" : "Ativar alertas sonoros"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Alert>
      )}

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle id="live-risk-title" className="text-base">Risco por par · LIVE</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Posições abertas, margem e perda estimada até o stop.</p>
            </div>
            {risk && (
              <Badge variant={risk.alertLevel === "danger" ? "destructive" : "outline"}>
                {risk.alertLevel === "danger" ? "Risco alto" : risk.alertLevel === "warning" ? "Atenção" : "Controlado"}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <AsyncState
              isLoading={riskQuery.isLoading}
              error={riskQuery.error}
              isEmpty={!!risk && risk.pairs.length === 0}
              onRetry={() => riskQuery.refetch()}
              empty={<EmptyState title="Nenhuma posição LIVE aberta" message="O risco por par aparecerá assim que o bot abrir uma posição real." />}
            >
              {risk && risk.pairs.length > 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="Margem aberta" value={money(risk.totalMargin)} />
                    <Metric label="Risco estimado" value={money(risk.totalRisk)} tone={risk.totalRiskPct >= 50 ? "text-destructive" : undefined} />
                    <Metric label="Risco / margem" value={`${risk.totalRiskPct.toFixed(1)}%`} />
                    <Metric label="Queda do pico" value={money(risk.drawdown)} tone={risk.drawdown > 0 ? "text-destructive" : undefined} />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm tabular-nums">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-3">Par</th><th className="py-2 pr-3">Posições</th>
                          <th className="py-2 pr-3">Entrada média</th><th className="py-2 pr-3">Margem</th>
                          <th className="py-2 pr-3">Risco</th><th className="py-2">Stop</th>
                        </tr>
                      </thead>
                      <tbody>
                        {risk.pairs.map((pair) => (
                          <tr key={pair.symbol} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium">{pair.symbol}</td>
                            <td className="py-2 pr-3">{pair.openOrders}</td>
                            <td className="py-2 pr-3">{money(pair.avgEntry)}</td>
                            <td className="py-2 pr-3">{money(pair.margin)}</td>
                            <td className="py-2 pr-3 text-destructive">{money(pair.riskAmount)} · {pair.riskPct.toFixed(1)}%</td>
                            <td className="py-2">
                              <Badge variant={pair.hasStop ? "outline" : "destructive"}>{pair.hasStop ? "Definido" : "Ausente"}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </AsyncState>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Saldo e ROI por ordem · LIVE</CardTitle>
            {analyticsQuery.data && (
              <p className="text-xs text-muted-foreground">
                {money(analyticsQuery.data.totals.balance)} · ROI {analyticsQuery.data.totals.roiPct >= 0 ? "+" : ""}{analyticsQuery.data.totals.roiPct.toFixed(2)}% · custos {money(analyticsQuery.data.totals.fees)}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <AsyncState
              isLoading={analyticsQuery.isLoading}
              error={analyticsQuery.error}
              isEmpty={!!analyticsQuery.data && chartData.length === 0}
              onRetry={() => analyticsQuery.refetch()}
              empty={<EmptyState title="Sem histórico LIVE" message="Cada nova ordem real adicionará um ponto ao gráfico." />}
            >
              {chartData.length > 0 && (
                <div className="h-64" aria-label="Gráfico do saldo acumulado por ordem LIVE">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="time" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} minTickGap={28} />
                      <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} width={58} />
                      <ReTooltip
                        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                        formatter={(value: number, name) => [money(value), name === "balance" ? "Saldo" : "Ordem"]}
                      />
                      <Area type="monotone" dataKey="balance" stroke="var(--brand-cyan)" fill="var(--primary)" fillOpacity={0.18} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </AsyncState>
          </CardContent>
        </Card>
      </div>

      {risk && !financialAlert && risk.alertLevel === "none" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-success" aria-hidden /> Saldo LIVE sem perda e sem queda do melhor resultado.
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}