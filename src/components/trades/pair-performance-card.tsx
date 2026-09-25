import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getBotConfig } from "@/lib/bot.functions";
import { getPairAnalytics } from "@/lib/orders.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/async-state";

export function PairPerformanceCard() {
  const configFn = useServerFn(getBotConfig);
  const analyticsFn = useServerFn(getPairAnalytics);
  const [selected, setSelected] = useState("");
  const config = useQuery({ queryKey: ["bot-config"], queryFn: () => configFn() });
  const mode = config.data?.executionMode ?? "DEMO";
  const analytics = useQuery({ queryKey: ["orders", "pairs", mode], queryFn: () => analyticsFn({ data: { mode, limit: 1000 } }), refetchInterval: 15_000 });
  const symbol = selected || analytics.data?.pairs[0]?.symbol || "";
  const pair = analytics.data?.pairs.find((item) => item.symbol === symbol);
  const points = useMemo(() => (analytics.data?.equityBySymbol[symbol] ?? []).map((p) => ({ time: new Date(p.t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), result: Number(p.cum.toFixed(2)) })), [analytics.data, symbol]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div><CardTitle className="text-base">Desempenho por par · {mode}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Resultado líquido acumulado e taxa de sucesso no modo salvo.</p></div>
        {analytics.data?.pairs.length ? <Select value={symbol} onValueChange={setSelected}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{analytics.data.pairs.map((item) => <SelectItem key={item.symbol} value={item.symbol}>{item.symbol}</SelectItem>)}</SelectContent></Select> : null}
      </CardHeader>
      <CardContent>
        {!analytics.isLoading && !analytics.isError && !pair ? <EmptyState title="Sem histórico por par" message={`As ordens ${mode} encerradas formarão este gráfico.`} /> : null}
        {analytics.isError ? <p className="text-sm text-destructive">Não foi possível carregar o gráfico.</p> : null}
        {pair ? <div className="space-y-4"><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><Metric label="Ordens" value={String(pair.orders)} /><Metric label="Taxa de sucesso" value={`${pair.winRate.toFixed(1)}%`} /><Metric label="Resultado líquido" value={`US$ ${pair.netPnl.toFixed(2)}`} /><Metric label="ROI" value={`${pair.roiPct >= 0 ? "+" : ""}${pair.roiPct.toFixed(2)}%`} /></div><div className="h-64" aria-label={`Gráfico de resultado acumulado de ${symbol}`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={points}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="time" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} minTickGap={28} /><YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} width={56} /><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }} /><Area type="monotone" dataKey="result" name="Resultado" stroke="var(--brand-cyan)" fill="var(--primary)" fillOpacity={0.18} strokeWidth={2} /></AreaChart></ResponsiveContainer></div></div> : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold tabular-nums">{value}</p></div>;
}