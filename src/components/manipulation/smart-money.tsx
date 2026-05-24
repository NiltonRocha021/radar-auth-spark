import { ORDER_FLOW, WHALE_ORDERS, FUNDING } from "@/lib/manipulation-data";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowUp, ArrowDown } from "lucide-react";

export function SmartMoney() {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
        </span>
        <h2 className="text-sm font-semibold">Smart Money Activity</h2>
      </div>

      <Tabs defaultValue="flow">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="flow">Order Flow</TabsTrigger>
          <TabsTrigger value="whales">Whales</TabsTrigger>
          <TabsTrigger value="funding">Funding</TabsTrigger>
        </TabsList>

        <TabsContent value="flow" className="mt-4 space-y-3">
          {ORDER_FLOW.map((o) => (
            <div key={o.asset}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium">{o.asset}</span>
                <span className="text-muted-foreground">
                  <span className="text-emerald-400">{o.buy}% buy</span> · <span className="text-red-400">{100 - o.buy}% sell</span>
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden flex bg-secondary">
                <div className="bg-emerald-500/80" style={{ width: `${o.buy}%` }} />
                <div className="bg-red-500/80" style={{ width: `${100 - o.buy}%` }} />
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="whales" className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Last 10 minutes</div>
          <div className="space-y-1.5">
            {WHALE_ORDERS.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-mono">
                <span className={w.side === "BUY" ? "text-emerald-400" : "text-red-400"}>
                  {w.side === "BUY" ? "🟢" : "🔴"} {w.side}
                </span>
                <span className="font-medium">{w.size}</span>
                <span className="text-muted-foreground">@ {w.price}</span>
                <span className="text-muted-foreground ml-auto">{w.ago}</span>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="funding" className="mt-4 space-y-2">
          {FUNDING.map((f) => (
            <div key={f.asset} className="rounded-lg border border-border bg-card/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{f.asset}</span>
                <span className={`text-sm font-semibold tabular-nums flex items-center gap-1 ${f.rate >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {f.rate >= 0 ? "+" : ""}
                  {f.rate.toFixed(3)}%
                  {f.dir === "up" && <ArrowUp className="size-3" />}
                  {f.dir === "up2" && <><ArrowUp className="size-3 -mr-2" /><ArrowUp className="size-3" /></>}
                  {f.dir === "down" && <ArrowDown className="size-3" />}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{f.note}</div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
