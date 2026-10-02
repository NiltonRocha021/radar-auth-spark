import { useLivePrices } from "@/hooks/useLivePrices";

export function BtcDominance() {
  const { global } = useLivePrices();
  const dom = global?.btcDominance;
  const change = global?.marketCapChange24h ?? 0;
  const up = change >= 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 h-full flex flex-col">
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-[15px] font-medium text-foreground">BTC Dominance</h3>
          <p className="text-[11px] text-muted-foreground">Atual · variação de mercado em 24h</p>
        </div>
        <div className="text-right">
           <div className="text-[22px] font-semibold tabular-nums text-foreground">{dom != null ? `${dom.toFixed(1)}%` : "—"}</div>
          <div className="text-[11px] font-medium" style={{ color: up ? "#1D9E75" : "#E24B4A" }}>
            {up ? "↑" : "↓"} {Math.abs(change).toFixed(2)}% market cap 24h
          </div>
        </div>
      </div>
      <div className="flex flex-1 min-h-[180px] items-center justify-center mt-2 rounded-lg bg-secondary/30">
        <p className="text-sm text-muted-foreground">Valor atual da capitalização global{dom == null ? " indisponível" : " em tempo real"}.</p>
      </div>
    </div>
  );
}
