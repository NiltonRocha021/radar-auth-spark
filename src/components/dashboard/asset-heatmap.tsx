import { useEffect, useState } from "react";
import { useLivePrices } from "@/hooks/useLivePrices";

function colorFor(change: number) {
  if (change > 3) return "#0E5F44";
  if (change > 1) return "#1D9E75";
  if (change > -1) return "#3A3D47";
  if (change > -3) return "#A6383A";
  return "#6B1F22";
}

export function AssetHeatmap() {
  const { prices } = useLivePrices();
  const [pulseTick, setPulseTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPulseTick((t) => t + 1), 8000);
    return () => clearInterval(id);
  }, []);

  const assets = Object.values(prices).map((p) => ({
    symbol: p.symbol,
    name: p.name,
    price: p.price,
    change: p.change24h ?? 0,
    volume: p.volume24h ?? 0,
  }));

  return (
    <div data-tour="heatmap" className="rounded-xl border border-border bg-card p-4 h-full">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[15px] font-medium text-foreground">Asset Heatmap</h3>
        <span className="text-[11px] text-muted-foreground">24h change</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {assets.map((a, i) => (
          <Cell key={a.symbol} asset={a} pulseTick={pulseTick} index={i} />
        ))}
      </div>
    </div>
  );
}

function Cell({ asset, pulseTick, index }: { asset: { symbol: string; name: string; price: number; change: number; volume: number }; pulseTick: number; index: number }) {
  const bg = colorFor(asset.change);
  const up = asset.change >= 0;
  const [bright, setBright] = useState(false);

  useEffect(() => {
    if (pulseTick === 0) return;
    const delay = (index % 4) * 120 + Math.random() * 200;
    const onT = setTimeout(() => setBright(true), delay);
    const offT = setTimeout(() => setBright(false), delay + 600);
    return () => {
      clearTimeout(onT);
      clearTimeout(offT);
    };
  }, [pulseTick, index]);

  const volFormatted = asset.volume >= 1e9
    ? `$${(asset.volume / 1e9).toFixed(1)}B`
    : asset.volume >= 1e6
      ? `$${(asset.volume / 1e6).toFixed(1)}M`
      : `$${asset.volume.toLocaleString()}`;

  return (
    <div
      className="relative group rounded-lg p-2.5 transition-all duration-500 hover:scale-[1.03] cursor-pointer"
      style={{
        background: `color-mix(in oklab, ${bg} ${bright ? 85 : 50}%, var(--card))`,
        border: `1px solid color-mix(in oklab, ${bg} ${bright ? 100 : 60}%, transparent)`,
        boxShadow: bright ? `0 0 16px color-mix(in oklab, ${bg} 70%, transparent)` : "none",
      }}
    >
      <div className="text-[13px] font-semibold text-foreground">{asset.symbol}</div>
      <div className="text-[11px] text-foreground/80 tabular-nums mt-0.5">
        {up ? "+" : ""}{asset.change.toFixed(1)}%
      </div>
      <div className="absolute z-20 hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 rounded-lg border border-border bg-card p-2.5 shadow-xl text-left">
        <div className="text-[12px] font-medium text-foreground">{asset.name}</div>
        <div className="text-[11px] text-muted-foreground">Price <span className="text-foreground tabular-nums">${asset.price.toLocaleString(undefined, { maximumFractionDigits: asset.price > 100 ? 1 : 3 })}</span></div>
        <div className="text-[11px] text-muted-foreground">24h Vol <span className="text-foreground">{volFormatted}</span></div>
      </div>
    </div>
  );
}
