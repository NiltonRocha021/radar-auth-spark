import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useBot4xStore } from "@/lib/bot4x-store";
import { useNotificationsStore } from "@/lib/notifications-store";

/**
 * Watches bot4x state and emits global notifications + sonner toasts.
 * Mount once at root layout. Stateless wrt UI.
 */
export function Bot4xGlobalNotifier() {
  const dailyPnl = useBot4xStore((s) => s.dailyPnlPct);
  const trailingPeak = useBot4xStore((s) => s.trailingPeakPct);
  const orders = useBot4xStore((s) => s.orders);
  const push = useNotificationsStore((s) => s.push);

  const lastBreaker = useRef(false);
  const lastLock = useRef(false);
  const knownOrderIds = useRef<Set<string>>(new Set());
  const firstRun = useRef(true);

  // Emergency shutdown when dailyPnl <= -1.5
  useEffect(() => {
    const breaker = dailyPnl <= -1.5;
    if (breaker && !lastBreaker.current) {
      push({
        type: "EMERGENCY_SHUTDOWN",
        title: "DISJUNTOR ATIVADO",
        body: `Drawdown diário em ${dailyPnl.toFixed(2)}%. Execução pausada até reset manual.`,
        persistent: true,
      });
      toast.error("Bot4x — DISJUNTOR ATIVADO", {
        description: `Drawdown diário ${dailyPnl.toFixed(2)}%`,
        duration: Infinity,
      });
    }
    lastBreaker.current = breaker;
  }, [dailyPnl, push]);

  // Profit lock when peak >= 3%
  useEffect(() => {
    const lock = trailingPeak >= 3.0;
    if (lock && !lastLock.current) {
      push({
        type: "PROFIT_LOCK",
        title: "Lucro preservado",
        body: `Trailing stop ativado em +${trailingPeak.toFixed(1)}%.`,
        persistent: true,
      });
      toast.success("Bot4x — Lucro preservado", {
        description: `+${trailingPeak.toFixed(1)}% travados`,
        duration: Infinity,
      });
    }
    lastLock.current = lock;
  }, [trailingPeak, push]);

  // New order = EXECUTE event
  useEffect(() => {
    if (firstRun.current) {
      orders.forEach((o) => knownOrderIds.current.add(o.id));
      firstRun.current = false;
      return;
    }
    for (const o of orders) {
      if (!knownOrderIds.current.has(o.id)) {
        knownOrderIds.current.add(o.id);
        push({
          type: "EXECUTE",
          title: `Bot4x executou ${o.pair}`,
          body: `${o.side} @ ${o.entry}`,
        });
        toast(`Bot4x executou: ${o.pair} ${o.side}`, {
          description: `Entry ${o.entry}`,
          duration: 8000,
        });
      }
    }
  }, [orders, push]);

  return null;
}
