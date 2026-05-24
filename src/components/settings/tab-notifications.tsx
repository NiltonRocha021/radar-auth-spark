import { SectionCard } from "./section-card";
import { useAlertsStore } from "@/lib/alerts-store";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Mail, MessageCircle, Smartphone, Globe } from "lucide-react";

const CHANNELS = [
  { id: "telegram" as const, icon: MessageCircle, label: "Telegram", desc: "Instant push via @AISignalRadarBot" },
  { id: "email" as const, icon: Mail, label: "Email", desc: "Daily digest and high-priority alerts" },
  { id: "push" as const, icon: Smartphone, label: "Mobile push", desc: "iOS / Android app notifications" },
  { id: "browser" as const, icon: Globe, label: "Browser push", desc: "Web notifications in this device" },
];

const TYPES = [
  { id: "signal" as const, label: "Trade signals" },
  { id: "manipulation" as const, label: "Manipulation alerts" },
  { id: "volatility" as const, label: "Volatility spikes" },
  { id: "profit" as const, label: "Profit/Stop hits" },
];

export function SettingsNotifications() {
  const s = useAlertsStore();
  return (
    <>
      <SectionCard title="Channels" description="Where you want to receive alerts.">
        <div className="space-y-2">
          {CHANNELS.map((c) => {
            const Icon = c.icon;
            const enabled = s.channels[c.id];
            return (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/30">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-md bg-secondary flex items-center justify-center">
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="text-xs text-muted-foreground">{c.desc}</div>
                  </div>
                </div>
                <Switch checked={enabled} onCheckedChange={() => s.toggleChannel(c.id)} />
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Alert types" description="Categories you want to subscribe to.">
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <label key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/30">
              <span className="text-sm">{t.label}</span>
              <Switch checked={s.types[t.id]} onCheckedChange={() => s.toggleType(t.id)} />
            </label>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Filters" description={`Minimum signal score: ${s.minScore}`}>
        <Slider value={[s.minScore]} min={0} max={100} step={5} onValueChange={(v) => s.setMinScore(v[0])} />
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>All signals</span>
          <span>High-confidence only</span>
        </div>
      </SectionCard>
    </>
  );
}
