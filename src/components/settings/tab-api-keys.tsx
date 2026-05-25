import { useState } from "react";
import { SectionCard } from "./section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Copy, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";

type ApiKey = { id: string; name: string; masked: string; permissions: string[]; reqs: number };

const PERMS = ["read:signals", "read:bot4x", "write:webhooks", "manage:account"];
const EVENTS = ["signal.created", "bot4x.trade", "alert.fired", "billing.invoice"];

function makeKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "aisr_live_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function makeWebhookSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return "whsec_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function UsageSparkline({ seed }: { seed: string }) {
  // deterministic pseudo-random 24h series from seed
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const pts = Array.from({ length: 24 }, (_, i) => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return ((h % 1000) / 1000) * 0.7 + Math.sin((i + (seed.length % 7)) / 3) * 0.2 + 0.4;
  });
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const w = 88, hPx = 26;
  const norm = (v: number) => hPx - ((v - min) / (max - min || 1)) * (hPx - 2) - 1;
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${(i / (pts.length - 1)) * w},${norm(v)}`).join(" ");
  const area = `${d} L${w},${hPx} L0,${hPx} Z`;
  const peak = Math.round(max * 280);
  return (
    <div className="flex items-center gap-2">
      <svg width={w} height={hPx} className="overflow-visible">
        <path d={area} fill="var(--brand-cyan)" fillOpacity="0.15" />
        <path d={d} fill="none" stroke="var(--brand-cyan)" strokeWidth="1.25" />
      </svg>
      <span className="text-[10px] text-muted-foreground font-mono">~{peak}/h</span>
    </div>
  );
}

export function SettingsApiKeys() {
  const [isPro, setIsPro] = useState(true); // institutional toggle for demo
  const [keys, setKeys] = useState<ApiKey[]>([
    { id: "k1", name: "Production bot", masked: "aisr_live_••••••••a1c9", permissions: ["read:signals", "read:bot4x"], reqs: 1284 },
  ]);
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<string[]>(["read:signals"]);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealed, setRevealed] = useState("");

  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret] = useState(() => makeWebhookSecret());
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["signal.created"]);
  const [deliveries, setDeliveries] = useState<{ ts: string; status: number; event: string }[]>([]);

  const togglePerm = (p: string) => setPerms((cur) => cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p]);
  const toggleEvent = (e: string) => setWebhookEvents((cur) => cur.includes(e) ? cur.filter(x => x !== e) : [...cur, e]);

  const generate = () => {
    if (!name.trim()) return toast.error("Enter a name for the key");
    const full = makeKey();
    setRevealed(full);
    setRevealOpen(true);
    setKeys((cur) => [...cur, { id: crypto.randomUUID(), name, masked: full.slice(0, 12) + "••••" + full.slice(-4), permissions: perms, reqs: 0 }]);
    setName("");
  };

  if (!isPro) {
    return (
      <SectionCard title="API Keys" description="Available on Institutional plan.">
        <div className="flex flex-col items-start gap-3 p-6 rounded-lg border border-dashed border-border bg-background/30 text-center w-full">
          <div className="mx-auto size-12 rounded-full bg-[var(--brand-blue-deep)] flex items-center justify-center">
            <Sparkles className="size-5 text-[var(--brand-cyan)]" />
          </div>
          <div className="mx-auto">
            <div className="text-sm font-semibold">Upgrade to Institutional</div>
            <div className="text-xs text-muted-foreground mt-1">Programmatic access, webhooks, and team management.</div>
          </div>
          <Button className="mx-auto" size="sm" onClick={() => setIsPro(true)}>Upgrade now</Button>
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard title="Create API key" description="Keys are shown in full only once.">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production bot" />
          </div>
          <div>
            <Label className="text-xs mb-2 block">Permissions</Label>
            <div className="grid grid-cols-2 gap-2">
              {PERMS.map((p) => (
                <label key={p} className="flex items-center justify-between p-2 rounded border border-border bg-background/30 text-sm">
                  <span className="font-mono text-xs">{p}</span>
                  <Switch checked={perms.includes(p)} onCheckedChange={() => togglePerm(p)} />
                </label>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={generate}>Generate key</Button>
        </div>
      </SectionCard>

      <SectionCard title="Your keys">
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left font-medium px-2 py-2">Name</th>
                <th className="text-left font-medium px-2 py-2">Key</th>
                <th className="text-left font-medium px-2 py-2">Permissions</th>
                <th className="text-left font-medium px-2 py-2">Usage (24h)</th>
                <th className="text-right font-medium px-2 py-2">Reqs / day</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-border/50">
                  <td className="px-2 py-2">{k.name}</td>
                  <td className="px-2 py-2 font-mono text-xs flex items-center gap-2">
                    {k.masked}
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { navigator.clipboard.writeText(k.masked); toast.success("Copied masked key"); }}>
                      <Copy className="size-3" />
                    </Button>
                  </td>
                  <td className="px-2 py-2"><div className="flex flex-wrap gap-1">{k.permissions.map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>)}</div></td>
                  <td className="px-2 py-2"><UsageSparkline seed={k.id + k.name} /></td>
                  <td className="px-2 py-2 text-right font-mono">{k.reqs.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">
                    <Button size="sm" variant="ghost" className="h-7 text-red-400" onClick={() => { setKeys((cur) => cur.filter(x => x.id !== k.id)); toast.success("Key revoked"); }}>Revoke</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Webhook" description="Receive HTTP callbacks for selected events.">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Endpoint URL</Label>
            <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://your-server.com/webhook" />
          </div>
          <div>
            <Label className="text-xs">Signing secret</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookSecret} className="font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(webhookSecret); toast.success("Copied"); }}><Copy className="size-3.5" /></Button>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Events</Label>
            <div className="grid grid-cols-2 gap-2">
              {EVENTS.map((e) => (
                <label key={e} className="flex items-center justify-between p-2 rounded border border-border bg-background/30 text-sm">
                  <span className="font-mono text-xs">{e}</span>
                  <Switch checked={webhookEvents.includes(e)} onCheckedChange={() => toggleEvent(e)} />
                </label>
              ))}
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => {
            if (!webhookUrl) return toast.error("Enter a webhook URL");
            const status = Math.random() > 0.2 ? 200 : 500;
            setDeliveries((cur) => [{ ts: new Date().toLocaleTimeString(), status, event: "signal.created" }, ...cur].slice(0, 8));
            status === 200 ? toast.success("Test webhook delivered") : toast.error("Webhook failed (500)");
          }}>Test webhook</Button>

          {deliveries.length > 0 && (
            <div className="mt-3 rounded-lg border border-border bg-background/30 p-2">
              <div className="text-xs text-muted-foreground mb-1.5 px-1">Delivery log</div>
              <ul className="space-y-1 text-xs font-mono">
                {deliveries.map((d, i) => (
                  <li key={i} className="flex items-center justify-between px-2 py-1 rounded bg-card/40">
                    <span>{d.ts} · {d.event}</span>
                    <Badge className={d.status === 200 ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-red-500/15 text-red-400 border border-red-500/30"}>{d.status}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SectionCard>

      <Dialog open={revealOpen} onOpenChange={(o) => !o && setRevealOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save your API key</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <span>This is the only time we'll show this key. Store it in a secret manager.</span>
          </div>
          <div className="flex gap-2">
            <Input readOnly value={revealed} className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(revealed); toast.success("Copied"); }}><Copy className="size-3.5" /></Button>
          </div>
          <DialogFooter>
            <Button onClick={() => { setRevealOpen(false); setRevealed(""); }}>I've saved my key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
