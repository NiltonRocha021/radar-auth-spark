import { create } from "zustand";
import {
  type ExecMode,
  type CalibProfile,
  type Order,
  type Side,
  type Tick,
  type Trade,
  makeTick,
  genHistory,
} from "./bot4x-data";
import { PROFILES } from "./bot4x-data";
import { bot4xAdapter, type BackendBot4xExecution } from "@/adapters/backend/bot4x.adapter";
import { backendWs } from "@/adapters/backend/ws-client";

// ─── FEATURE FLAG ─────────────────────────────────────────────────────────────
// Set VITE_BOT4X_REAL_ENABLED=true in .env only after backend Fase 1 is live.
// While false, REAL MODE button is disabled and no backend calls are made.
const REAL_MODE_ENABLED = import.meta.env.VITE_BOT4X_REAL_ENABLED === "true";

// ─── STATE TYPE ───────────────────────────────────────────────────────────────

type State = {
  mode: ExecMode;
  totalCapital: number;
  allocationPct: number;
  leverage: number;
  profile: CalibProfile;
  slPct: number;
  tpPct: number;
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

  // Real mode state
  status: "IDLE" | "LOADING" | "STARTING" | "RUNNING" | "STOPPING" | "STOPPED" | "ERROR";
  circuitBreaker: "none" | "emergency" | "profitLock";
  errorMsg: string | null;
  realInited: boolean;

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

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function genCtxTick(get: () => State): Tick {
  const s = get();
  return makeTick({
    profile: PROFILES[s.profile],
    slotsUsed: s.orders.length,
    busyPairs: s.orders.map((o) => o.pair),
    shutdown: s.dailyPnlPct <= -1.5,
  });
}

// Mapeia profile do backend ("calibradoRSI"/"calibradoAiScore") para CalibProfile local.
function mapBackendProfile(p: string | undefined): CalibProfile {
  if (p === "calibradoRSI") return "rsi";
  if (p === "calibradoAiScore") return "aiscore";
  if (p === "conservador" || p === "agressivo" || p === "scalper" || p === "intraday" || p === "swing" || p === "position" || p === "rsi" || p === "aiscore") {
    return p as CalibProfile;
  }
  return "conservador";
}

// Converte uma execução do backend para o tipo Trade completo usado pelo histórico local.
function executionToTrade(e: BackendBot4xExecution, profile: CalibProfile, leverage: number): Trade {
  const openedAt = e.createdAt ? new Date(e.createdAt).getTime() : Date.now();
  const pnl = e.pnl ?? 0;
  const side: Side = e.side === "BUY" || e.side === "LONG" ? "LONG" : "SHORT";
  const result: Trade["result"] =
    e.status === "open" || e.status === "pending" ? "BLOCKED" : pnl >= 0 ? "WIN" : "LOSS";
  const entry = e.entryPrice ?? 0;
  return {
    id: e.id,
    day: new Date(openedAt).toISOString().slice(0, 10),
    pair: e.pair,
    side,
    entry,
    stop: entry,
    target: entry,
    result,
    pnl,
    pnlPct: pnl,
    accumulated: 0,
    profile,
    leverage,
    motivo: "",
    hour: new Date(openedAt).getHours(),
  };
}


// Unsubscribe handle from backendWs.on("bot4x:update", ...) — limpo no cleanup().
let wsUnsub: (() => void) | null = null;

// ─── STORE ────────────────────────────────────────────────────────────────────


export const useBot4xStore = create<State>((set, get) => ({
  mode: "DEMO",
  totalCapital: 1000,
  allocationPct: 30,
  leverage: 3,
  profile: (typeof window !== "undefined" && (localStorage.getItem("bot4x.profile") as CalibProfile)) || "conservador",
  slPct: (typeof window !== "undefined" && Number(localStorage.getItem("bot4x.slPct"))) || 0.5,
  tpPct: (typeof window !== "undefined" && Number(localStorage.getItem("bot4x.tpPct"))) || 1.0,
  orders: [],
  dailyPnlPct: 0,
  trailingPeakPct: 0,
  ticks: [],
  ticksProcessed: 1247,
  feedPaused: false,
  history: [],
  monitorTab: "tick",
  preferredPairs:
    (typeof window !== "undefined" && JSON.parse(localStorage.getItem("bot4x.preferredPairs") || "[]")) || [],
  avoidPairs: (typeof window !== "undefined" && JSON.parse(localStorage.getItem("bot4x.avoidPairs") || "[]")) || [],

  // Real mode initial state
  status: "IDLE",
  circuitBreaker: "none",
  errorMsg: null,
  realInited: false,

  // ─── INIT ───────────────────────────────────────────────────────────────────
  init: async () => {
    const s = get();
    const mode = s.mode;

    // ── DEMO MODE: keep existing simulation 100% unchanged ──────────────────
    if (mode === "DEMO" || !REAL_MODE_ENABLED) {
      if (s._ticker) return; // already running
      const history = genHistory(183);
      set({ history });
      get().seedOrders();

      const ticker = setInterval(() => {
        if (get().feedPaused) return;
        const t = genCtxTick(get);
        set((prev) => {
          // 1) walk PnL of open orders (random walk, slight positive bias)
          const walked = prev.orders.map((o) => {
            const drift = (Math.random() - 0.48) * 0.18;
            return { ...o, pnlPct: +(o.pnlPct + drift).toFixed(2) };
          });
          // 2) close orders that hit SL or TP
          const slLimit = -prev.slPct;
          const tpLimit = prev.tpPct;
          const alive = walked.filter((o) => o.pnlPct > slLimit && o.pnlPct < tpLimit);

          // 3) open new order if tick was approved and a slot is free
          let nextOrders = alive;
          const slotsFree = alive.length < 3;
          const pairBusy = alive.some((o) => o.pair === t.pair);
          const pairAvoided = prev.avoidPairs.includes(t.pair);
          if (t.verdict === "EXECUTE" && t.side && slotsFree && !pairBusy && !pairAvoided) {
            const side: Side = t.side === "BUY" ? "LONG" : "SHORT";
            const base = t.pair.startsWith("BTC")
              ? 65000
              : t.pair.startsWith("ETH")
                ? 1800
                : t.pair.startsWith("SOL")
                  ? 150
                  : t.pair.startsWith("BNB")
                    ? 580
                    : 1 + Math.random() * 40;
            const entry = +(base * (0.99 + Math.random() * 0.02)).toFixed(2);
            const slMult = prev.slPct / 100;
            const tpMult = prev.tpPct / 100;
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
            ticks: [t, ...prev.ticks].slice(0, 40),
            ticksProcessed: prev.ticksProcessed + 1,
            orders: nextOrders,
          };
        });
      }, 8000);

      // seed a few ticks immediately
      set({ ticks: Array.from({ length: 5 }, () => genCtxTick(get)), _ticker: ticker });
      return;
    }

    // ── REAL MODE: pull state from backend ──────────────────────────────────
    if (get().realInited) return;
    set({ status: "LOADING", realInited: true });

    try {
      // Get authenticated user ID from Supabase
      const { supabase } = await import("@/integrations/supabase/client");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uid = user?.id;
      if (!uid) throw new Error("Usuário não autenticado");

      const [config, executions] = await Promise.all([bot4xAdapter.getConfig(uid), bot4xAdapter.executions()]);

      const profile = mapBackendProfile(config?.profile);
      const leverage = get().leverage;

      // Map backend executions to Trade format for history
      const mappedHistory: Trade[] = (executions ?? []).map((e: BackendBot4xExecution) =>
        executionToTrade(e, profile, leverage),
      );

      set({
        status: config?.active ? "RUNNING" : "IDLE",
        profile,
        circuitBreaker: (config?.circuitBreaker as State["circuitBreaker"]) ?? "none",
        history: mappedHistory,
        errorMsg: null,
      });

      // ── Subscribe to real-time backend events via WebSocket ───────────────
      wsUnsub = backendWs.on("bot4x:update", (raw) => {
        const event = raw as { type: string; [k: string]: unknown };

        switch (event.type) {
          case "EXECUTION": {
            // New fill from backend worker — prepend to history
            const ex = event.execution as BackendBot4xExecution;
            const s = get();
            const trade = executionToTrade(ex, s.profile, s.leverage);
            set((prev) => ({
              history: [trade, ...prev.history].slice(0, 500),
            }));
            break;
          }
          case "CIRCUIT_BREAKER": {
            // Backend triggered daily SL or profit lock
            set({
              status: "STOPPED",
              circuitBreaker: (event.reason as State["circuitBreaker"]) ?? "emergency",
            });
            break;
          }
          case "STATUS": {
            set({ status: event.status as State["status"] });
            break;
          }
          case "CAPITAL_UPDATE": {
            set({ dailyPnlPct: (event.dailyPnL as number) ?? 0 });
            break;
          }
          default:
            break;
        }
      });

    } catch (err) {
      console.error("[Bot4x] init real failed:", err);
      set({
        status: "ERROR",
        errorMsg: "Não foi possível conectar ao backend. Tente novamente.",
        realInited: false,
      });
    }
  },

  // ─── CLEANUP ────────────────────────────────────────────────────────────────
  cleanup: () => {
    const t = get()._ticker;
    if (t) clearInterval(t);
    // In real mode, also unsubscribe WS
    if (wsUnsub) {
      wsUnsub();
      wsUnsub = null;
    }

    set({ _ticker: undefined });
  },

  // ─── SETTERS (unchanged) ────────────────────────────────────────────────────
  setMode: (mode) => set({ mode }),
  setTotalCapital: (n) => set({ totalCapital: Math.max(0, n) }),
  setAllocationPct: (n) => set({ allocationPct: Math.min(100, Math.max(1, n)) }),
  setLeverage: (n) => set({ leverage: Math.min(10, Math.max(1, n)) }),
  setProfile: (profile) => {
    if (typeof window !== "undefined") localStorage.setItem("bot4x.profile", profile);
    set({ profile });
  },
  setSlPct: (n) => {
    const v = Math.min(10, Math.max(0.1, +Number(n).toFixed(2)));
    if (typeof window !== "undefined") localStorage.setItem("bot4x.slPct", String(v));
    set({ slPct: v });
  },
  setTpPct: (n) => {
    const v = Math.min(20, Math.max(0.1, +Number(n).toFixed(2)));
    if (typeof window !== "undefined") localStorage.setItem("bot4x.tpPct", String(v));
    set({ tpPct: v });
  },
  setPreferredPairs: (pairs) => {
    if (typeof window !== "undefined") localStorage.setItem("bot4x.preferredPairs", JSON.stringify(pairs));
    set({ preferredPairs: pairs });
  },
  setAvoidPairs: (pairs) => {
    if (typeof window !== "undefined") localStorage.setItem("bot4x.avoidPairs", JSON.stringify(pairs));
    set({ avoidPairs: pairs });
  },
  closeOrder: (id) => set((s) => ({ orders: s.orders.filter((o) => o.id !== id) })),
  seedOrders: () => {
    const sample: Order[] = [
      {
        id: "o1",
        pair: "BTC/USDT",
        side: "LONG",
        entry: 43240,
        sl: 43168,
        tp: 43385,
        openedAt: Date.now() - 1000 * 60 * 4,
        pnlPct: +0.18,
      },
      {
        id: "o2",
        pair: "ETH/USDT",
        side: "SHORT",
        entry: 2251,
        sl: 2257,
        tp: 2239,
        openedAt: Date.now() - 1000 * 60 * 12,
        pnlPct: -0.09,
      },
    ];
    set({ orders: sample });
  },
  setMonitorTab: (monitorTab) => set({ monitorTab }),
  toggleFeedPaused: () => set((s) => ({ feedPaused: !s.feedPaused })),
  clearTicks: () => set({ ticks: [] }),
}));

// ─── SELECTORS ────────────────────────────────────────────────────────────────

export function selectActiveCapital(s: State) {
  return +(s.totalCapital * (s.allocationPct / 100)).toFixed(2);
}
export function selectSlotSize(s: State) {
  return +(selectActiveCapital(s) / 3).toFixed(2);
}
