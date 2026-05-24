import { useState } from "react";
import { Copy, Check, Lock, Plus, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SAMPLE_KEYS, RATE_LIMITS, type ApiKey } from "@/lib/api-data";
import { cn } from "@/lib/utils";

// Page is public; key generation requires Institutional plan.
// In a real app this comes from session/user context.
const USER_PLAN: "Starter" | "Pro" | "Institutional" = "Pro";

export function KeysManagement() {
  const [keys, setKeys] = useState<ApiKey[]>(SAMPLE_KEYS);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const canGenerate = USER_PLAN === "Institutional";

  function mask(k: string) {
    return "••••" + k.slice(-4);
  }

  async function copy(k: ApiKey) {
    try {
      await navigator.clipboard.writeText(k.key);
      setCopiedId(k.id);
      toast.success("API key copied to clipboard");
      setTimeout(() => setCopiedId(null), 1400);
    } catch {}
  }

  function revoke(id: string) {
    setKeys((p) => p.filter((k) => k.id !== id));
    toast("Key revoked", { description: "Future requests with this key will return 401." });
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">API keys</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Manage keys, rotate, and monitor usage.</p>
        </div>
        {canGenerate ? (
          <Button size="sm" className="bg-[#378ADD] hover:bg-[#2d74bd] text-white">
            <Plus className="size-3.5 mr-1" /> Generate new key
          </Button>
        ) : (
          <UpgradePrompt />
        )}
      </header>

      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-muted-foreground bg-secondary/30">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Name</th>
              <th className="text-left font-medium px-4 py-2.5">Key</th>
              <th className="text-left font-medium px-4 py-2.5">Plan</th>
              <th className="text-right font-medium px-4 py-2.5">Requests today</th>
              <th className="text-left font-medium px-4 py-2.5">Created</th>
              <th className="text-right font-medium px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-border/60">
                <td className="px-4 py-3 font-medium">{k.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-foreground/80">{mask(k.key)}</td>
                <td className="px-4 py-3">
                  <span className="text-[11px] px-2 py-0.5 rounded border border-[#378ADD]/30 bg-[#378ADD]/10 text-[#5fa8ff]">{k.plan}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{k.requestsToday.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{k.createdAt}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => copy(k)}
                      className="size-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                      title="Copy key"
                    >
                      {copiedId === k.id ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                    </button>
                    <button
                      onClick={() => revoke(k.id)}
                      className="size-7 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 flex items-center justify-center transition-colors"
                      title="Revoke key"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No active keys.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Rate limits</h3>
        <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground bg-secondary/30">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Plan</th>
                <th className="text-left font-medium px-4 py-2.5">Daily quota</th>
                <th className="text-left font-medium px-4 py-2.5">Burst</th>
                <th className="text-left font-medium px-4 py-2.5">Streams</th>
              </tr>
            </thead>
            <tbody>
              {RATE_LIMITS.map((r) => (
                <tr key={r.plan} className={cn("border-t border-border/60", r.plan === "Institutional" && "bg-[#378ADD]/5")}>
                  <td className="px-4 py-3 font-medium">{r.plan}</td>
                  <td className="px-4 py-3 tabular-nums">{r.limit}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.burst}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.streams}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function UpgradePrompt() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#378ADD]/30 bg-gradient-to-r from-[#378ADD]/10 to-transparent px-3 py-2">
      <Lock className="size-4 text-[#5fa8ff]" />
      <div className="text-xs">
        <div className="font-medium">Key generation requires Institutional</div>
        <div className="text-muted-foreground">Upgrade to unlock unlimited API access.</div>
      </div>
      <Button size="sm" variant="outline" className="border-[#378ADD]/40 text-[#5fa8ff] hover:bg-[#378ADD]/10">
        <Sparkles className="size-3.5 mr-1" /> Upgrade
      </Button>
    </div>
  );
}
