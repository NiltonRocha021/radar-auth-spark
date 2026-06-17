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
  orders: Order[];
  dailyPnlPct: number;
  trailingPeakPct: number;
  ticks: Tick[];
  ticksProcessed: number;
  feedPaused: boolean;
  history: Trade[];
  monitorTab: "tick" | "order" | "shutdown";
  _ticker?: ReturnType<typeof setInterval>;

  init: () => void;
  cleanup: () => void;
  setMode: (m: ExecMode) => void;
  setTotalCapital: (n: number) => void;
  setAllocationPct: (n: number) => void;
  setLeverage: (n: number) => void;
  setProfile: (p: CalibProfile) => void;
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
      set((s) => ({ ticks: [t, ...s.ticks].slice(0, 40), ticksProcessed: s.ticksProcessed + 1 }));
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
