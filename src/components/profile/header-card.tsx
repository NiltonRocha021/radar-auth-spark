import { Camera, Crown, TrendingUp, Eye, CalendarDays } from "lucide-react";
import { useRef } from "react";
import { useProfileStore } from "@/lib/profile-store";
import { Button } from "@/components/ui/button";

const PLAN_COLORS: Record<string, string> = {
  Starter: "#6b7280",
  Pro: "#3B82F6",
  Institutional: "#A78BFA",
};

export function HeaderCard() {
  const { info, plan, memberSince, archetype, daysActive, signalsViewed, setInfo } = useProfileStore();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setInfo({ avatarDataUrl: reader.result as string });
    reader.readAsDataURL(f);
  };

  const initials = info.fullName
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <section className="rounded-xl border border-border bg-card/40 p-5">
      <div className="flex flex-col lg:flex-row lg:items-center gap-5">
        {/* Avatar */}
        <div className="flex items-center gap-4 lg:gap-5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative size-20 rounded-full overflow-hidden shrink-0 ring-2 ring-border bg-[var(--brand-blue-deep)] flex items-center justify-center"
          >
            {info.avatarDataUrl ? (
              <img src={info.avatarDataUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-2xl font-semibold text-foreground">{initials}</span>
            )}
            <span className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="size-5 text-white" />
            </span>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          </button>

          {/* Identity */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[20px] font-medium leading-tight">{info.fullName}</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--brand-blue-deep)] text-[var(--brand-cyan)] text-[10px] font-semibold tracking-wider">
                <TrendingUp className="size-3" />
                {archetype}
              </span>
            </div>
            <div className="text-sm text-muted-foreground mt-0.5 truncate">{info.email}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <CalendarDays className="size-3" /> Member since {memberSince}
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="lg:ml-auto flex flex-col items-start lg:items-end gap-2">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider"
              style={{
                background: `${PLAN_COLORS[plan]}1f`,
                color: PLAN_COLORS[plan],
                border: `1px solid ${PLAN_COLORS[plan]}40`,
              }}
            >
              <Crown className="size-3" /> {plan}
            </span>
            {plan === "Starter" && (
              <Button size="sm" variant="link" className="h-auto p-0 text-[var(--brand-cyan)] text-xs">
                Upgrade to Pro →
              </Button>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              <b className="text-foreground tabular-nums">{daysActive}</b> days active
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="size-3.5" />
              <b className="text-foreground tabular-nums">{signalsViewed}</b> signals viewed
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
