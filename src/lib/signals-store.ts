import { create } from "zustand";
import { initialSignals, type Signal, type AssetClass } from "./signals-data";
import { backendWs } from "@/adapters/backend/ws-client";


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
  flashIds: string[];
  lastSyncAt: number | null;
  _intervalIds: Set<number>;
  _wsUnsub: (() => void) | null;
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
  _intervalIds: new Set<number>(),
  _wsUnsub: null,
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
        isMock: false,
      }));

      // Em dev mantemos mocks atrás dos sinais reais para visualização;
      // em produção os mocks são descartados para evitar decisões baseadas
      // em dados fictícios.
      set((st) => ({
        signals: [
          ...mapped,
          ...(import.meta.env.DEV ? st.signals.filter((s) => s.isMock) : []),
        ].slice(0, 60),
        lastSyncAt: Date.now(),
      }));
    } catch {
      // silencioso — mantém o que já estiver em memória
    }
  },
  init: () => {
    if (get()._intervalIds.size > 0 || get()._wsUnsub) return;

    // Sync inicial
    get().syncFromBackend();

    // Stream em tempo real via WebSocket: substitui o setInterval de 10s.
    const unsub = backendWs.on("signal:new", (payload) => {
      if (!get().live) return;
      const signal = payload as Signal;
      if (!signal?.id) return;
      set((st) => ({
        signals: [signal, ...st.signals.filter((x) => x.id !== signal.id)].slice(0, 60),
        toasts: [{ id: signal.id, signal, createdAt: Date.now() }, ...st.toasts].slice(0, 3),
      }));
    });

    // Fallback: re-sync a cada 60s se o WS não estiver autenticado/ativo.
    const syncInterval = window.setInterval(() => {
      if (backendWs.isAuthenticatedOpen()) return; // WS está cuidando dos updates
      get().syncFromBackend();
    }, 60_000);

    set({
      _intervalIds: new Set<number>([syncInterval]),
      _wsUnsub: unsub,
    });
  },
  cleanup: () => {
    get()._intervalIds.forEach((id) => clearInterval(id));
    const unsub = get()._wsUnsub;
    if (unsub) unsub();
    set({ _intervalIds: new Set<number>(), _wsUnsub: null });
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
