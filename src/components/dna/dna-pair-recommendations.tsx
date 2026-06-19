import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, Sparkles, ShieldAlert, RefreshCcw, Check } from "lucide-react";
import { toast } from "sonner";
import { useBot4xStore } from "@/lib/bot4x-store";
import { analyzePairs, type PairAnalysisResult } from "@/lib/dna-pair-analyzer";

export function DnaPairRecommendations() {
  const history = useBot4xStore((s) => s.history);
  const preferredPairs = useBot4xStore((s) => s.preferredPairs);
  const avoidPairs = useBot4xStore((s) => s.avoidPairs);
  const setPreferredPairs = useBot4xStore((s) => s.setPreferredPairs);
  const setAvoidPairs = useBot4xStore((s) => s.setAvoidPairs);

  const [result, setResult] = useState<PairAnalysisResult>(() => analyzePairs(history));

  useEffect(() => {
    setResult(analyzePairs(history));
    const id = setInterval(() => setResult(analyzePairs(useBot4xStore.getState().history)), 10_000);
    return () => clearInterval(id);
  }, [history]);

  const applied = useMemo(
    () =>
      preferredPairs.join(",") === result.preferred.join(",") &&
      avoidPairs.join(",") === result.avoid.join(","),
    [preferredPairs, avoidPairs, result],
  );

  const apply = () => {
    setPreferredPairs(result.preferred);
    setAvoidPairs(result.avoid);
    toast.success("Bot4x atualizado com recomendações do DNA", {
      description: `${result.preferred.length} preferidos · ${result.avoid.length} evitados`,
    });
  };

  const clear = () => {
    setPreferredPairs([]);
    setAvoidPairs([]);
    toast("Recomendações limpas — Bot4x volta a operar todos os pares");
  };

  return (
    <div className="space-y-5">
      <Card className="rounded-xl border border-border bg-card/40 p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[var(--brand-cyan)]" />
              <h2 className="text-sm font-semibold">Recomendações de Pares (DNA)</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Análise de sequências de 3 trades, tendência e volume. Pares preferidos são priorizados pelo Bot4x; pares a evitar têm execução bloqueada.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setResult(analyzePairs(useBot4xStore.getState().history))} className="h-8 gap-1.5 text-xs">
              <RefreshCcw className="size-3.5" /> Atualizar
            </Button>
            <Button size="sm" onClick={apply} disabled={applied} className="h-8 gap-1.5 text-xs">
              <Check className="size-3.5" /> {applied ? "Aplicado" : "Aplicar ao Bot4x"}
            </Button>
            {(preferredPairs.length > 0 || avoidPairs.length > 0) && (
              <Button variant="ghost" size="sm" onClick={clear} className="h-8 text-xs">Limpar</Button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          <SummaryBox title="Operar mais (PREFER)" pairs={result.preferred} color="emerald" icon={<TrendingUp className="size-4" />} empty="Nenhum par com 3 vitórias consecutivas + tendência favorável" />
          <SummaryBox title="Evitar (AVOID)" pairs={result.avoid} color="red" icon={<ShieldAlert className="size-4" />} empty="Nenhum par com 3 perdas consecutivas" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground border-b border-border">
              <tr className="text-left">
                <th className="py-2 pr-3">Par</th>
                <th className="py-2 pr-3">Trades</th>
                <th className="py-2 pr-3">WR</th>
                <th className="py-2 pr-3">PnL%</th>
                <th className="py-2 pr-3">Streak</th>
                <th className="py-2 pr-3">Tendência</th>
                <th className="py-2 pr-3">Volume</th>
                <th className="py-2 pr-3">Recomendação</th>
                <th className="py-2">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {result.analyses.map((a) => (
                <tr key={a.pair} className="border-b border-border/40 hover:bg-background/40">
                  <td className="py-2 pr-3 font-medium">{a.pair}</td>
                  <td className="py-2 pr-3 tabular-nums">{a.total}</td>
                  <td className="py-2 pr-3 tabular-nums">{a.winRate}%</td>
                  <td className={`py-2 pr-3 tabular-nums ${a.pnlSum >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {a.pnlSum >= 0 ? "+" : ""}{a.pnlSum}%
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    <span className={a.streak >= 3 ? "text-emerald-400 font-semibold" : a.streak <= -3 ? "text-red-400 font-semibold" : ""}>
                      {a.streak > 0 ? `+${a.streak}` : a.streak}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <TrendBadge trend={a.trend} />
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{a.volumeScore}%</td>
                  <td className="py-2 pr-3">
                    <RecoBadge reco={a.recommendation} />
                  </td>
                  <td className="py-2 text-muted-foreground">{a.reason}</td>
                </tr>
              ))}
              {result.analyses.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Sem histórico suficiente ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SummaryBox({ title, pairs, color, icon, empty }: { title: string; pairs: string[]; color: "emerald" | "red"; icon: React.ReactNode; empty: string }) {
  const cls =
    color === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
      : "border-red-500/30 bg-red-500/5 text-red-300";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold">{icon}{title}</div>
      {pairs.length === 0 ? (
        <p className="text-[11px] opacity-70">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {pairs.map((p) => <Badge key={p} variant="outline" className="text-[10px] h-5">{p}</Badge>)}
        </div>
      )}
    </div>
  );
}

function TrendBadge({ trend }: { trend: "UP" | "DOWN" | "FLAT" }) {
  if (trend === "UP") return <span className="inline-flex items-center gap-1 text-emerald-400"><TrendingUp className="size-3" />UP</span>;
  if (trend === "DOWN") return <span className="inline-flex items-center gap-1 text-red-400"><TrendingDown className="size-3" />DOWN</span>;
  return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="size-3" />FLAT</span>;
}

function RecoBadge({ reco }: { reco: "PREFER" | "AVOID" | "NEUTRAL" }) {
  if (reco === "PREFER") return <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px] h-5">PREFER</Badge>;
  if (reco === "AVOID") return <Badge className="bg-red-500/15 text-red-300 border-red-500/30 text-[10px] h-5">AVOID</Badge>;
  return <Badge variant="outline" className="text-[10px] h-5">NEUTRAL</Badge>;
}
