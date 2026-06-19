import { create } from "zustand";
import {
  type ExecMode, type CalibProfile, type Order, type Side, type Tick, type Trade,
  makeTick, genHistory,
} from "./bot4x-data";
import { PROFILES } from "./bot4x-data";

type State = {
  mode: ExecMode;
  totalCapital: number;
  allocationPct: number;
  leverage: number;
  profile: CalibProfile;
  slPct: number; // stop loss (positive percent, e.g. 0.5 = -0.5%)
  tpPct: number; // take profit (positive percent, e.g. 1.0 = +1.0%)
  orders: Order[];
  dailyPnlPct: number;
  trailingPeakPct: number;
  ticks: Tick[];
  ticksProcessed: number;
  feedPaused: boolean;
  history: Trade[];
  monitorTab: "tick" | "order" | "shutdown";
  preferredPairs: string[];
  avoidPairs: string[];
  _ticker?: ReturnType<typeof setInterval>;

  init: () => void;
  cleanup: () => void;
  setMode: (m: ExecMode) => void;
  setTotalCapital: (n: number) => void;
  setAllocationPct: (n: number) => void;
  setLeverage: (n: number) => void;
  setProfile: (p: CalibProfile) => void;
  setSlPct: (n: number) => void;
  setTpPct: (n: number) => void;
  setPreferredPairs: (pairs: string[]) => void;
  setAvoidPairs: (pairs: string[]) => void;
  closeOrder: (id: string) => void;
  seedOrders: () => void;
  setMonitorTab: (t: "tick" | "order" | "shutdown") => void;
  toggleFeedPaused: () => void;
  clearTicks: () => void;
};

function genCtxTick(get: () => State): Tick {
  const s = get();
  return makeTick({
    profile: PROFILES[s.profile],
    slotsUsed: s.orders.length,
    busyPairs: s.orders.map((o) => o.pair),
    shutdown: s.dailyPnlPct <= -1.5,
  });
}

export const useBot4xStore = create<State>((set, get) => ({
  mode: "DEMO",
  totalCapital: 1000,
  allocationPct: 30,
  leverage: 3,
  profile: (typeof window !== "undefined" && (localStorage.getItem("bot4x.profile") as CalibProfile)) || "conservador",
  slPct: (typeof window !== "undefined" && Number(localStorage.getItem("bot4x.slPct"))) || 0.5,
  tpPct: (typeof window !== "undefined" && Number(localStorage.getItem("bot4x.tpPct"))) || 1.0,
  orders: [],
  dailyPnlPct: -0.42,
  trailingPeakPct: 0,
  ticks: [],
  ticksProcessed: 1247,
  feedPaused: false,
  history: [],
  monitorTab: "tick",

  init: () => {
    if (get()._ticker) return;
    const history = genHistory(183);
    set({ history });
    get().seedOrders();
    const ticker = setInterval(() => {
      if (get().feedPaused) return;
      const t = genCtxTick(get);
      set((s) => {
        // 1) walk PnL of open orders (random walk, slight positive bias)
        const walked = s.orders.map((o) => {
          const drift = (Math.random() - 0.48) * 0.18;
          return { ...o, pnlPct: +(o.pnlPct + drift).toFixed(2) };
        });
        // 2) close orders that hit SL or TP (configurable via store)
        const slLimit = -s.slPct;
        const tpLimit = s.tpPct;
        const alive = walked.filter((o) => o.pnlPct > slLimit && o.pnlPct < tpLimit);

        // 3) open new order if tick was approved and a slot is free
        let nextOrders = alive;
        const slotsFree = alive.length < 3;
        const pairBusy = alive.some((o) => o.pair === t.pair);
        if (t.verdict === "EXECUTE" && t.side && slotsFree && !pairBusy) {
          const side: Side = t.side === "BUY" ? "LONG" : "SHORT";
          const base = t.pair.startsWith("BTC") ? 65000
            : t.pair.startsWith("ETH") ? 1800
            : t.pair.startsWith("SOL") ? 150
            : t.pair.startsWith("BNB") ? 580
            : 1 + Math.random() * 40;
          const entry = +(base * (0.99 + Math.random() * 0.02)).toFixed(2);
          const slMult = s.slPct / 100;
          const tpMult = s.tpPct / 100;
          nextOrders = [
            ...alive,
            {
              id: `o_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
              pair: t.pair,
              side,
              entry,
              sl: +(entry * (side === "LONG" ? 1 - slMult : 1 + slMult)).toFixed(2),
              tp: +(entry * (side === "LONG" ? 1 + tpMult : 1 - tpMult)).toFixed(2),
              openedAt: Date.now(),
              pnlPct: 0,
            },
          ];
        }
        return {
          ticks: [t, ...s.ticks].slice(0, 40),
          ticksProcessed: s.ticksProcessed + 1,
          orders: nextOrders,
        };
      });
    }, 8000);
    // seed a few ticks immediately
    set({ ticks: Array.from({ length: 5 }, () => genCtxTick(get)) });
    set({ _ticker: ticker });
  },
  cleanup: () => {
    const t = get()._ticker;
    if (t) clearInterval(t);
    set({ _ticker: undefined });
  },
  setMode: (mode) => set({ mode }),
  setTotalCapital: (n) => set({ totalCapital: Math.max(0, n) }),
  setAllocationPct: (n) => set({ allocationPct: Math.min(100, Math.max(1, n)) }),
  setLeverage: (n) => set({ leverage: Math.min(10, Math.max(1, n)) }),
  setProfile: (profile) => { if (typeof window !== "undefined") localStorage.setItem("bot4x.profile", profile); set({ profile }); },
  setSlPct: (n) => { const v = Math.min(10, Math.max(0.1, +Number(n).toFixed(2))); if (typeof window !== "undefined") localStorage.setItem("bot4x.slPct", String(v)); set({ slPct: v }); },
  setTpPct: (n) => { const v = Math.min(20, Math.max(0.1, +Number(n).toFixed(2))); if (typeof window !== "undefined") localStorage.setItem("bot4x.tpPct", String(v)); set({ tpPct: v }); },
  closeOrder: (id) => set((s) => ({ orders: s.orders.filter((o) => o.id !== id) })),
  seedOrders: () => {
    const sample: Order[] = [
      { id: "o1", pair: "BTC/USDT", side: "LONG", entry: 43240, sl: 43168, tp: 43385, openedAt: Date.now() - 1000 * 60 * 4, pnlPct: +0.18 },
      { id: "o2", pair: "ETH/USDT", side: "SHORT", entry: 2251, sl: 2257, tp: 2239, openedAt: Date.now() - 1000 * 60 * 12, pnlPct: -0.09 },
    ];
    set({ orders: sample });
  },
  setMonitorTab: (monitorTab) => set({ monitorTab }),
  toggleFeedPaused: () => set((s) => ({ feedPaused: !s.feedPaused })),
  clearTicks: () => set({ ticks: [] }),
}));

export function selectActiveCapital(s: State) {
  return +(s.totalCapital * (s.allocationPct / 100)).toFixed(2);
}
export function selectSlotSize(s: State) {
  return +(selectActiveCapital(s) / 3).toFixed(2);
}
