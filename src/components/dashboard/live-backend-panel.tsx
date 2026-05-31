import { useAuth } from "@/lib/auth";
import { usePrices } from "@/hooks/usePrices";
import { useSignals, type BackendSignal } from "@/hooks/useSignals";
import { useDnaProfile } from "@/hooks/useDnaProfile";
import { Activity, Brain, TrendingUp, AlertCircle } from "lucide-react";

function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-secondary rounded ${className}`} />;
}

function PriceCard() {
  const price = usePrices("BTCUSDT");
  const loading = price === null;

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="size-7 rounded-md flex items-center justify-center"
          style={{ background: "color-mix(in oklab, #EF9F27 18%, transparent)", color: "#EF9F27" }}
        >
          <TrendingUp className="size-4" />
        </div>
        <h3 className="text-[13px] font-medium text-foreground">BTC / USDT</h3>
        <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wide">Live</span>
      </div>
      {loading ? (
        <SkeletonLine className="h-8 w-32" />
      ) : (
        <div className="text-[28px] font-semibold tabular-nums text-foreground leading-none">
          ${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
      )}
      <div className="text-[11px] text-muted-foreground mt-1">Atualiza a cada 5s</div>
    </div>
  );
}

function DnaCard() {
  const { user } = useAuth();
  const { data: dna, isLoading, isError } = useDnaProfile(user?.id);

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="size-7 rounded-md flex items-center justify-center"
          style={{ background: "color-mix(in oklab, #378ADD 18%, transparent)", color: "#378ADD" }}
        >
          <Brain className="size-4" />
        </div>
        <h3 className="text-[13px] font-medium text-foreground">DNA Profile</h3>
      </div>
      {!user ? (
        <div className="text-[12px] text-muted-foreground">Faça login para visualizar seu DNA.</div>
      ) : isLoading ? (
        <div className="space-y-2">
          <SkeletonLine className="h-3 w-3/4" />
          <SkeletonLine className="h-3 w-1/2" />
        </div>
      ) : isError || !dna ? (
        <div className="flex items-center gap-1.5 text-[12px] text-[#E24B4A]">
          <AlertCircle className="size-3.5" /> Não foi possível carregar.
        </div>
      ) : (
        <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words max-h-32 overflow-auto">
          {JSON.stringify(dna, null, 2)}
        </pre>
      )}
    </div>
  );
}

function SignalsList() {
  const { data: signals, isLoading, isError } = useSignals();

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 md:col-span-2">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="size-7 rounded-md flex items-center justify-center"
          style={{ background: "color-mix(in oklab, #1D9E75 18%, transparent)", color: "#1D9E75" }}
        >
          <Activity className="size-4" />
        </div>
        <h3 className="text-[13px] font-medium text-foreground">Live Signals</h3>
        <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wide">
          {signals?.length ?? 0} sinais
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonLine key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-1.5 text-[12px] text-[#E24B4A]">
          <AlertCircle className="size-3.5" /> Erro ao carregar sinais do backend.
        </div>
      ) : !signals?.length ? (
        <div className="text-center py-6 text-[12px] text-muted-foreground">
          Nenhum sinal disponível no momento.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium py-1.5 pr-3">Asset</th>
                <th className="text-left font-medium py-1.5 pr-3">Dir</th>
                <th className="text-right font-medium py-1.5 pr-3">Entry</th>
                <th className="text-right font-medium py-1.5 pr-3">Score</th>
                <th className="text-left font-medium py-1.5">TF</th>
              </tr>
            </thead>
            <tbody className="text-foreground tabular-nums">
              {signals.slice(0, 6).map((s: BackendSignal) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2 pr-3 font-medium">{s.asset}</td>
                  <td className="py-2 pr-3">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{
                        background:
                          s.direction === "BUY"
                            ? "color-mix(in oklab, #1D9E75 18%, transparent)"
                            : "color-mix(in oklab, #E24B4A 18%, transparent)",
                        color: s.direction === "BUY" ? "#1D9E75" : "#E24B4A",
                      }}
                    >
                      {s.direction}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right">{s.entry}</td>
                  <td className="py-2 pr-3 text-right">{s.score}</td>
                  <td className="py-2 text-muted-foreground">{s.tf ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function LiveBackendPanel() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      <PriceCard />
      <DnaCard />
      <SignalsList />
    </div>
  );
}
