import { create } from "zustand";
import { initialSignals, type Signal, type AssetClass } from "./signals-data";

export type ViewMode = "cards" | "table" | "radar";
export type SortKey = "score" | "rr" | "age" | "volDelta";

type SignalToast = { id: string; signal: Signal; createdAt: number };

type Filters = {
  search: string;
  assetClass: "All" | AssetClass;
  timeframe: "All" | Signal["tf"];
  direction: "All" | "BUY" | "SELL";
  scoreMin: 0 | 60 | 75 | 90;
  exchanges: string[]; // empty = all
  // Advanced
  scoreRange: [number, number];
  minRR: number;
  volatility: { low: boolean; med: boolean; high: boolean };
  manipRisk: { low: boolean; medium: boolean; high: boolean };
  setups: Record<string, boolean>;
  session: "All" | "Asia" | "London" | "NY";
  dnaCompat70: boolean;
  bot4xOnly: boolean;
};

type State = {
  signals: Signal[];
  filters: Filters;
  view: ViewMode;
  sort: SortKey;
  live: boolean;
  advOpen: boolean;
  streamOpen: boolean;
  pinnedId: string | null;
  hoverId: string | null;
  detailId: string | null;
  toasts: SignalToast[];
  flashIds: Set<string>;
  lastSyncAt: number | null;
  _intervalIds: Set<number>;
  syncFromBackend: () => Promise<void>;
  // actions
  setView: (v: ViewMode) => void;
  setSort: (s: SortKey) => void;
  setLive: (v: boolean) => void;
  toggleAdv: () => void;
  toggleStream: () => void;
  setFilter: <K extends keyof Filters>(k: K, v: Filters[K]) => void;
  toggleExchange: (e: string) => void;
  pin: (id: string | null) => void;
  setHover: (id: string | null) => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  dismissToast: (id: string) => void;
  init: () => void;
  cleanup: () => void;
};


let intervals: number[] = [];

export const useSignalsStore = create<State>((set, get) => ({
  signals: initialSignals,
  filters: {
    search: "",
    assetClass: "All",
    timeframe: "All",
    direction: "All",
    scoreMin: 0,
    exchanges: [],
    scoreRange: [0, 100],
    minRR: 0,
    volatility: { low: true, med: true, high: true },
    manipRisk: { low: true, medium: true, high: true },
    setups: {},
    session: "All",
    dnaCompat70: false,
    bot4xOnly: false,
  },
  view: "cards",
  sort: "score",
  live: true,
  advOpen: false,
  streamOpen: false,
  pinnedId: null,
  hoverId: null,
  detailId: null,
  toasts: [],
  flashIds: new Set(),
  setView: (v) => set({ view: v }),
  setSort: (s) => set({ sort: s }),
  setLive: (v) => set({ live: v }),
  toggleAdv: () => set((s) => ({ advOpen: !s.advOpen })),
  toggleStream: () => set((s) => ({ streamOpen: !s.streamOpen })),
  setFilter: (k, v) => set((s) => ({ filters: { ...s.filters, [k]: v } })),
  toggleExchange: (e) =>
    set((s) => {
      const has = s.filters.exchanges.includes(e);
      return {
        filters: {
          ...s.filters,
          exchanges: has ? s.filters.exchanges.filter((x) => x !== e) : [...s.filters.exchanges, e],
        },
      };
    }),
  pin: (id) => set({ pinnedId: id }),
  setHover: (id) => set({ hoverId: id }),
  openDetail: (id) => set({ detailId: id }),
  closeDetail: () => set({ detailId: null }),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  lastSyncAt: null,
  syncFromBackend: async () => {
    try {
      const { signalAdapter } = await import("@/adapters/backend/signal.adapter");
      const backendSignals = await signalAdapter.list();
      if (!backendSignals?.length) return;

      const mapped: Signal[] = backendSignals.map((s) => ({
        id: s.id,
        asset: s.symbol,
        assetClass: "Crypto" as AssetClass,
        exchange: s.exchange ?? "Binance",
        direction: s.direction,
        score: s.confidence,
        tf: (s.tf ?? "1H") as Signal["tf"],
        entry: s.entry,
        stop: s.sl ?? s.entry * 0.995,
        target: s.tp ?? s.entry * 1.01,
        rr: s.tp
          ? Number(((s.tp - s.entry) / (s.entry - (s.sl ?? s.entry * 0.995))).toFixed(1))
          : 2.0,
        riskPct: 0.5,
        volDelta: 0,
        confirms: { rsi: true, macd: false, volume: true, structure: true, vwap: false },
        dnaMatch: 70,
        manipRisk: "low",
        setup: "Breakout",
        session: "NY",
        ageMin: 0,
        status: (s.state === "active" ? "active" : "expired") as Signal["status"],
      }));

      set((st) => ({
        signals: [...mapped, ...st.signals.filter((x) => x.id.startsWith("sig-"))].slice(0, 60),
        lastSyncAt: Date.now(),
      }));
    } catch {
      // silencioso — mantém mock
    }
  },
  init: () => {
    if (intervals.length) return;
    // Sincronizar com backend (silencioso — mantém mock se falhar)
    get().syncFromBackend();
    // New signal every 10s
    const newSig = window.setInterval(() => {
      if (!get().live) return;
      const pool = initialSignals;
      const seed = pool[Math.floor(Math.random() * pool.length)];
      const id = `live-${Date.now()}`;
      const s: Signal = {
        ...seed,
        id,
        ageMin: 0,
        status: "new",
        score: Math.round(70 + Math.random() * 28),
      };
      set((st) => ({
        signals: [s, ...st.signals].slice(0, 60),
        toasts: [{ id, signal: s, createdAt: Date.now() }, ...st.toasts].slice(0, 3),
      }));
    }, 10000);
    // Score flash every 30s
    const flash = window.setInterval(() => {
      if (!get().live) return;
      const cur = get().signals;
      if (!cur.length) return;
      const target = cur[Math.floor(Math.random() * Math.min(6, cur.length))];
      const delta = Math.round((Math.random() - 0.4) * 6);
      set((st) => ({
        signals: st.signals.map((x) =>
          x.id === target.id ? { ...x, score: Math.max(40, Math.min(99, x.score + delta)) } : x
        ),
        flashIds: new Set([...st.flashIds, target.id]),
      }));
      setTimeout(() => {
        set((st) => {
          const next = new Set(st.flashIds);
          next.delete(target.id);
          return { flashIds: next };
        });
      }, 1500);
    }, 30000);
    // Expire every 60s
    const expire = window.setInterval(() => {
      if (!get().live) return;
      set((st) => {
        const idx = st.signals.findIndex((s) => s.status !== "expired");
        if (idx === -1) return st;
        const copy = [...st.signals];
        copy[idx] = { ...copy[idx], status: "expired" };
        return { signals: copy };
      });
    }, 60000);
    intervals = [newSig, flash, expire];
  },
  cleanup: () => {
    intervals.forEach((id) => clearInterval(id));
    intervals = [];
  },
}));

export function selectFilteredSorted(state: State): Signal[] {
  const { signals, filters, sort } = state;
  const exchSet = new Set(filters.exchanges);
  const setupKeys = Object.keys(filters.setups).filter((k) => filters.setups[k]);
  let list = signals.filter((s) => {
    if (filters.search && !s.asset.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.assetClass !== "All" && s.assetClass !== filters.assetClass) return false;
    if (filters.timeframe !== "All" && s.tf !== filters.timeframe) return false;
    if (filters.direction !== "All" && s.direction !== filters.direction) return false;
    if (s.score < filters.scoreMin) return false;
    if (exchSet.size && !exchSet.has(s.exchange)) return false;
    if (s.score < filters.scoreRange[0] || s.score > filters.scoreRange[1]) return false;
    if (s.rr < filters.minRR) return false;
    if (!filters.manipRisk[s.manipRisk]) return false;
    if (setupKeys.length && !setupKeys.includes(s.setup)) return false;
    if (filters.session !== "All" && s.session !== filters.session) return false;
    if (filters.dnaCompat70 && s.dnaMatch < 70) return false;
    return true;
  });
  list = [...list].sort((a, b) => {
    if (sort === "score") return b.score - a.score;
    if (sort === "rr") return b.rr - a.rr;
    if (sort === "age") return a.ageMin - b.ageMin;
    return b.volDelta - a.volDelta;
  });
  return list;
}

export function selectStats(signals: Signal[]) {
  const total = signals.length;
  const buy = signals.filter((s) => s.direction === "BUY").length;
  const sell = signals.filter((s) => s.direction === "SELL").length;
  const avg = total ? Math.round(signals.reduce((a, s) => a + s.score, 0) / total) : 0;
  const inst = signals.filter((s) => s.score >= 90).length;
  const high = signals.filter((s) => s.score >= 75).length;
  const expired = signals.filter((s) => s.status === "expired").length;
  return { total, buy, sell, avg, inst, high, expired };
}
