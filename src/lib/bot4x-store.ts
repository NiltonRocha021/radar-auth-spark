import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  type ExecMode,
  type CalibProfile,
  type Order,
  type Side,
  type Tick,
  type Trade,
  makeTick,
  analyzeCandles,
} from "./bot4x-data";
import { PROFILES } from "./bot4x-data";
import { TOP_20_USDT_PAIRS, fetchTickerPrices, type KlineInterval } from "./market-data";
import type { BotConfigDTO, BotExecutionDTO } from "./bot.functions";
import { supabase } from "@/integrations/supabase/client";
import { loadTrades, saveTradeWithOutbox } from "./bot4x-trades-db";
import { logger } from "./logger";
import { startDemoMarketFeed, stopDemoMarketFeed, getDemoMarketPrices } from "./demo-market-feed";
import { getMarketCandles, startMarketCandleCache, stopMarketCandleCache } from "./market-candle-cache";
import { pollWithRetry } from "./polling-metrics";
import { loadConfig, saveConfig } from "./bot4x-config-db";
import type { CalibProfile as CalibProfileType } from "./bot4x-data";

export function getEffectiveMode(persistedMode: ExecMode): ExecMode {
  return persistedMode;
}

// ─── RISK MODEL CONSTANTS ─────────────────────────────────────────────────────
export const MAX_SLOTS = 10;
export const RISK_PER_SLOT = 0.1;

// ─── USER-SCOPED STORAGE ──────────────────────────────────────────────────────
// Cada usuário tem sua própria chave: "bot4x-store-v1:<uid>".
// O storage dinâmico lê o userId do próprio state na hora de montar/hidratar.
function makeUserStorage(getUserId: () => string | null) {
  return {
    getItem: (name: string) => {
      const uid = getUserId();
      const key = uid ? `${name}:${uid}` : name;
      return localStorage.getItem(key);
    },
    setItem: (name: string, value: string) => {
      const uid = getUserId();
      const key = uid ? `${name}:${uid}` : name;
      localStorage.setItem(key, value);
    },
    removeItem: (name: string) => {
      const uid = getUserId();
      const key = uid ? `${name}:${uid}` : name;
      localStorage.removeItem(key);
    },
  };
}

// ─── STATE TYPE ───────────────────────────────────────────────────────────────

type State = {
  // Identity
  userId: string | null;

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
  dnaMinSample: number; // mínimo de trades fechados por par para veredito DNA
  demoRealVersion: number;
  _ticker?: ReturnType<typeof setInterval>;

  // Real mode state
  status: "IDLE" | "LOADING" | "STARTING" | "RUNNING" | "STOPPING" | "STOPPED" | "ERROR";
  circuitBreaker: "none" | "emergency" | "profitLock";
  errorMsg: string | null;
  realInited: boolean;

  setUserId: (uid: string | null) => void;
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
  setDnaMinSample: (n: number) => void;
  closeOrder: (id: string) => void;
  seedOrders: () => void;
  setMonitorTab: (t: "tick" | "order" | "shutdown") => void;
  toggleFeedPaused: () => void;
  clearTicks: () => void;
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function demoTimeframe(profile: CalibProfile): { interval: KlineInterval; limit: number } {
  if (profile === "scalper") return { interval: "5m", limit: 300 };
  if (profile === "intraday") return { interval: "15m", limit: 300 };
  if (profile === "swing") return { interval: "4h", limit: 300 };
  if (profile === "position") return { interval: "1d", limit: 500 };
  return { interval: "1h", limit: 300 };
}

function mapBackendProfile(p: string | null | undefined): CalibProfile {
  if (p === "calibradoRSI") return "rsi";
  if (p === "calibradoAiScore") return "aiscore";
  if (
    p === "conservador" ||
    p === "agressivo" ||
    p === "scalper" ||
    p === "intraday" ||
    p === "swing" ||
    p === "position" ||
    p === "rsi" ||
    p === "aiscore"
  ) {
    return p as CalibProfile;
  }
  return "conservador";
}

function executionToTrade(e: BotExecutionDTO, profile: CalibProfile, leverage: number): Trade {
  const openedAt = e.createdAt ? new Date(e.createdAt).getTime() : Date.now();
  const pnl = e.pnl ?? 0;
  const side: Side = e.side === "BUY" || e.side === "LONG" ? "LONG" : "SHORT";
  const result: Trade["result"] =
    e.result === "WIN" || e.result === "LOSS" || e.result === "BLOCKED"
      ? (e.result as Trade["result"])
      : pnl >= 0
        ? "WIN"
        : "LOSS";
  const entry = e.entry ?? 0;
  return {
    id: e.id,
    day: e.day ?? new Date(openedAt).toISOString().slice(0, 10),
    pair: e.pair,
    side,
    entry,
    stop: e.stop ?? entry,
    target: e.target ?? entry,
    result,
    pnl,
    pnlPct: e.pnlPct ?? pnl,
    accumulated: 0,
    profile: mapBackendProfile(e.profile) ?? profile,
    leverage: e.leverage ?? leverage,
    motivo: "",
    hour: new Date(openedAt).getHours(),
  };
}


let realPollCleanup: (() => void) | null = null;

// ─── STORE ────────────────────────────────────────────────────────────────────

// Guardamos o userId fora do store para o storage customizado poder acessá-lo
// sem criar dependência circular.
let _currentUserId: string | null = null;

export const useBot4xStore = create<State>()(
  persist(
    (set, get) => ({
      // Identity
      userId: null,

      mode: "DEMO",
      totalCapital: 1000,
      allocationPct: 30,
      leverage: 3,
      profile: "conservador",
      slPct: 0.5,
      tpPct: 1.0,
      orders: [],
      dailyPnlPct: 0,
      trailingPeakPct: 0,
      ticks: [],
      ticksProcessed: 0,
      feedPaused: false,
      history: [],
      monitorTab: "tick",
      preferredPairs: [],
      avoidPairs: [],
      dnaMinSample: 10,
      demoRealVersion: 0,

      status: "IDLE",
      circuitBreaker: "none",
      errorMsg: null,
      realInited: false,

      // ─── SET USER ID ──────────────────────────────────────────────────────
      // Chamado ao login/logout via supabase.auth.onAuthStateChange.
      // Ao trocar de usuário, força rehidratação do storage correto.
      setUserId: (uid) => {
        const prev = get().userId;
        if (prev === uid) return;
        // Limpa tickers/WS antes de trocar de usuário para não vazar handles
        // do usuário anterior nem misturar streams entre contas.
        get().cleanup();
        _currentUserId = uid;
        set({ userId: uid, realInited: false });

        // Rehidrata o store com os dados do novo usuário
        useBot4xStore.persist.rehydrate();
        // Carrega histórico real do banco ao logar
        if (uid) {
          loadTrades(uid)
            .then((trades) => {
              if (trades.length > 0) set({ history: trades });
            })
            .catch(() => {
              /* silently ignore — localStorage fallback já foi carregado */
            });
        }
        // Carrega configuração persistida no banco
        if (uid) {
          loadConfig(uid)
            .then((cfg) => {
              if (!cfg) return;
              const previousMode = get().mode;
              const previousProfile = get().profile;
              set({
                mode: cfg.executionMode,
                profile: cfg.profile as CalibProfileType,
                leverage: cfg.leverage,
                slPct: cfg.slPct,
                tpPct: cfg.tpPct,
                allocationPct: cfg.allocationPct,
                totalCapital: cfg.totalCapital,
                preferredPairs: cfg.preferredPairs,
                avoidPairs: cfg.avoidPairs,
                circuitBreaker: cfg.circuitBreaker as State["circuitBreaker"],
                dailyPnlPct: cfg.dailyPnl,
              });

              // A configuração do banco pode chegar depois do primeiro init.
              // Reinicia o motor quando ela muda o modo/perfil para evitar um
              // motor DEMO rodando com configuração REAL (ou timeframe antigo).
              // setUserId() encerra o runtime anterior para trocar o escopo
              // do usuário. Mesmo quando modo/perfil não mudam, o novo usuário
              // precisa ter um motor iniciado após a configuração ser carregada.
              if (previousMode !== cfg.executionMode || previousProfile !== cfg.profile) {
                get().cleanup();
              }
              set({ status: "IDLE", realInited: false, errorMsg: null });
              queueMicrotask(() => void get().init());
            })
            .catch(() => {
              /* fallback para localStorage */
            });
        }
      },

      // ─── INIT ─────────────────────────────────────────────────────────────
      init: async () => {
        const s = get();
        const mode = s.mode;

        // ── DEMO MODE ────────────────────────────────────────────────────────
        // DEMO é paper trading, mas a análise e o preço vêm exclusivamente da Binance.
        if (mode === "DEMO") {
          if (s._ticker !== undefined && s._ticker !== null) return;

          // Migração única: remove posições do simulador antigo, que usava preços/drift artificiais.
          if (s.demoRealVersion !== 1) {
            set({ orders: [], demoRealVersion: 1, errorMsg: null });
          }

          const uid = get().userId;
          if (s.history.length === 0 && uid) {
            void loadTrades(uid).then((trades) => {
              if (trades.length > 0) set({ history: trades });
            }).catch(() => undefined);
          }

          const runCycle = async () => {
            if (get().feedPaused) return;
            const current = get();
            const profile = current.profile;
            const { interval, limit } = demoTimeframe(profile);
            const demoUniverse = [...current.preferredPairs, ...TOP_20_USDT_PAIRS.map((p) => p.symbol.replace("USDT", "/USDT"))]
              .filter((p, i, a) => a.indexOf(p) === i)
              .filter((p) => !current.avoidPairs.includes(p));
            startDemoMarketFeed(demoUniverse);
            startMarketCandleCache(demoUniverse, interval);
            const configured = [...current.preferredPairs, ...TOP_20_USDT_PAIRS.map((p) => p.symbol.replace("USDT", "/USDT"))]
              .filter((p, i, a) => a.indexOf(p) === i)
              .filter((p) => !current.avoidPairs.includes(p));
            const scanSize = 5;
            const offset = (current.ticksProcessed * scanSize) % Math.max(scanSize, configured.length);
            const scanPairs = Array.from({ length: Math.min(scanSize, configured.length) }, (_, i) =>
              configured[(offset + i) % configured.length],
            );
            const activeSymbols = current.orders.map((o) => o.pair.replace("/", ""));
            const streamPrices = getDemoMarketPrices();
            const prices = Object.keys(streamPrices).length > 0
              ? streamPrices
              : await fetchTickerPrices([...activeSymbols, ...scanPairs.map((p) => p.replace("/", ""))]);
            const markets = (await Promise.allSettled(
              scanPairs.map(async (pair) => {
                const symbol = pair.replace("/", "");
                const candles = await getMarketCandles(symbol, interval, limit);
                return analyzeCandles(symbol, interval, candles);
              }),
            )).flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
            if (markets.length === 0) throw new Error("Nenhum par retornou dados suficientes da Binance.");
              const now = Date.now();

              set((prev) => {
                const closed: Array<Order & { closeReason: "TP" | "SL" }> = [];
                const alive: Order[] = [];
                for (const o of prev.orders) {
                  const px = prices[o.pair.replace("/", "")];
                  if (!Number.isFinite(px)) { alive.push(o); continue; }
                  const hitSl = o.side === "LONG" ? px <= o.sl : px >= o.sl;
                  const hitTp = o.side === "LONG" ? px >= o.tp : px <= o.tp;
                  const rawPct = o.side === "LONG" ? ((px - o.entry) / o.entry) * 100 : ((o.entry - px) / o.entry) * 100;
                  const pnlPct = +(rawPct * prev.leverage).toFixed(3);
                  if (hitSl || hitTp) closed.push({ ...o, pnlPct, closeReason: hitTp ? "TP" : "SL" }); else alive.push({ ...o, pnlPct });
                }
                const newTrades: Trade[] = closed.map((o) => ({
                  id: o.id,
                  day: new Date(now).toISOString().slice(0, 10),
                  pair: o.pair,
                  side: o.side,
                  entry: o.entry,
                  stop: o.sl,
                  target: o.tp,
                  result: o.closeReason === "TP" ? "WIN" : "LOSS",
                  pnl: +((o.pnlPct * (prev.totalCapital * (prev.allocationPct / 100))) / 100).toFixed(2),
                  pnlPct: o.pnlPct,
                  accumulated: 0,
                  profile: prev.profile,
                  leverage: prev.leverage,
                  motivo: o.closeReason === "TP" ? "TP atingido por preço real" : "SL atingido por preço real",
                  hour: new Date(now).getHours(),
                }));
                if (newTrades.length && prev.userId) {
                  for (const trade of newTrades) void saveTradeWithOutbox(prev.userId, trade);
                }

                const today = new Date(now).toISOString().slice(0, 10);
                const allToday = [...newTrades, ...prev.history.filter((h) => h.day === today)];
                const dailyPnlPct = +allToday.reduce((acc, t) => acc + t.pnlPct, 0).toFixed(3);
                const circuitBreakerActive = dailyPnlPct <= -1.5 || prev.circuitBreaker === "emergency";
                const candidateTicks = markets.map((market) => makeTick({
                  profile: PROFILES[prev.profile],
                  slotsUsed: alive.length,
                  busyPairs: alive.map((o) => o.pair),
                  shutdown: circuitBreakerActive,
                  market,
                }));
                const executableTicks = candidateTicks
                  .filter((tick) => tick.verdict === "EXECUTE")
                  .sort((a, b) => b.aiScore - a.aiScore);
                const t = executableTicks[0] ?? candidateTicks[0];
                const selectedMarket = markets.find((market) => market.pair === t?.pair) ?? markets[0];
                let nextOrders = alive;
                const pairBusy = alive.some((o) => o.pair === t.pair);
                const pairAvoided = prev.avoidPairs.includes(t.pair);
                const canOpenNewPosition =
                  !circuitBreakerActive &&
                  t.verdict === "EXECUTE" &&
                  Boolean(t.side) &&
                  alive.length < MAX_SLOTS &&
                  !pairBusy &&
                  !pairAvoided;
                if (canOpenNewPosition) {
                  const side: Side = t.side === "BUY" ? "LONG" : "SHORT";
                  const slMult = prev.slPct / 100;
                  const tpMult = prev.tpPct / 100;
                  const liveEntry = prices[t.pair.replace("/", "")];
                  const entry = Number.isFinite(liveEntry) ? liveEntry : selectedMarket.price;
                  nextOrders = [...alive, {
                    id: `demo_${now}_${t.pair.replace("/", "")}`, pair: t.pair, side, entry,
                    sl: +(entry * (side === "LONG" ? 1 - slMult : 1 + slMult)).toFixed(8),
                    tp: +(entry * (side === "LONG" ? 1 + tpMult : 1 - tpMult)).toFixed(8),
                    openedAt: now, pnlPct: 0,
                  }];
                }
                return {
                  ticks: [...candidateTicks, ...prev.ticks].slice(0, 40),
                  ticksProcessed: prev.ticksProcessed + 1,
                  orders: nextOrders,
                  dailyPnlPct,
                  circuitBreaker: circuitBreakerActive ? "emergency" : prev.circuitBreaker === "emergency" ? "none" : prev.circuitBreaker,
                  history: newTrades.length ? [...newTrades, ...prev.history].slice(0, 500) : prev.history,
                  status: "RUNNING" as const,
                  errorMsg: null,
                };
              });
            } catch (error) {
              logger.warn?.("[Bot4x DEMO] ciclo de mercado falhou", { error });
              set({ errorMsg: error instanceof Error ? error.message : "Falha ao obter dados reais da Binance." });
            }
          };

          void runCycle();
          const ticker = setInterval(() => { void runCycle(); }, 8000);
          set({ _ticker: ticker, status: "RUNNING", ticks: [] });
          return;
        }

        // ── REAL MODE ────────────────────────────────────────────────────────
        if (get().realInited) return;
        set({ status: "LOADING", realInited: true });

        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const uid = user?.id;
          if (!uid) throw new Error("Usuário não autenticado");

          const { getBotConfig, getBotExecutions } = await import("./bot.functions");

          const applySnapshot = (config: BotConfigDTO | null, executions: BotExecutionDTO[]) => {
            const profile = mapBackendProfile(config?.profile);
            const leverage = config?.leverage ?? get().leverage;
            const mappedHistory: Trade[] = executions.map((e) => executionToTrade(e, profile, leverage));
            set({
              status: config?.active ? "RUNNING" : "IDLE",
              profile,
              circuitBreaker: (config?.circuitBreaker as State["circuitBreaker"]) ?? "none",
              dailyPnlPct: config?.dailyPnl ?? get().dailyPnlPct,
              history: mappedHistory,
              errorMsg: null,
            });
          };

          const pull = async () =>
            pollWithRetry(
              "bot4x",
              async () => {
                const [config, executions] = await Promise.all([
                  getBotConfig(),
                  getBotExecutions({ data: { limit: 200 } }),
                ]);
                applySnapshot(config ?? null, executions ?? []);
                return { executions: executions?.length ?? 0, active: config?.active ?? false };
              },
              { maxRetries: 3, extra: (r) => r },
            );

          await pull();

          // Sem WebSocket: polling leve enquanto a tela do bot estiver aberta.
          // Falhas passam por retries em backoff exponencial + jitter antes de
          // cair no estado de erro amigável.
          const pollId = window.setInterval(() => {
            void pull().catch((err) => {
              logger.warn?.("[Bot4x] poll falhou após retries", { error: err });
              set({
                errorMsg:
                  "Não foi possível atualizar os dados do bot após várias tentativas. Verifique sua conexão.",
              });
            });
          }, 15_000);
          realPollCleanup = () => window.clearInterval(pollId);
        } catch (err) {
          logger.error("[Bot4x] init real failed", { error: err });
          set({
            status: "ERROR",
            errorMsg: "Não foi possível carregar os dados do bot. Tente novamente.",
            realInited: false,
          });
        }

      },

      // ─── CLEANUP ──────────────────────────────────────────────────────────
      cleanup: () => {
        const t = get()._ticker;
        if (t) clearInterval(t);
        stopDemoMarketFeed();
        stopMarketCandleCache();
        if (realPollCleanup) {
          realPollCleanup();
          realPollCleanup = null;
        }
        set({ _ticker: undefined });
      },

      // ─── SETTERS ──────────────────────────────────────────────────────────
      setMode: (mode) => {
        get().cleanup();
        set({ mode, realInited: false, status: "IDLE", errorMsg: null });
        if (get().userId) {
          void import("./bot.functions")
            .then(({ updateBotConfig }) => updateBotConfig({ data: { executionMode: mode === "REAL" ? "LIVE" : "DEMO" } }))
            .then(() => get().init())
            .catch((error) => {
              set({ mode: mode === "REAL" ? "DEMO" : "REAL", errorMsg: error instanceof Error ? error.message : "Não foi possível salvar o modo." });
            });
        }
      },
      setTotalCapital: (n) => {
        const v = Math.max(0, n);
        set({ totalCapital: v });
        const uid = get().userId;
        if (uid) saveConfig(uid, { totalCapital: v });
      },
      setAllocationPct: (n) => {
        const v = Math.min(100, Math.max(1, n));
        set({ allocationPct: v });
        const uid = get().userId;
        if (uid) saveConfig(uid, { allocationPct: v });
      },
      setLeverage: (n) => {
        const v = Math.min(10, Math.max(1, n));
        set({ leverage: v });
        const uid = get().userId;
        if (uid) saveConfig(uid, { leverage: v });
      },
      setProfile: (profile) => {
        const changed = get().profile !== profile;
        set({ profile });
        const uid = get().userId;
        if (uid) saveConfig(uid, { profile });
        if (changed && get().mode === "DEMO") {
          get().cleanup();
          set({ status: "IDLE", errorMsg: null });
          queueMicrotask(() => void get().init());
        }
      },
      setSlPct: (n) => {
        const v = Math.min(10, Math.max(0.1, +Number(n).toFixed(2)));
        set({ slPct: v });
        const uid = get().userId;
        if (uid) saveConfig(uid, { slPct: v });
      },
      setTpPct: (n) => {
        const v = Math.min(20, Math.max(0.1, +Number(n).toFixed(2)));
        set({ tpPct: v });
        const uid = get().userId;
        if (uid) saveConfig(uid, { tpPct: v });
      },
      setPreferredPairs: (pairs) => {
        set({ preferredPairs: pairs });
        const uid = get().userId;
        if (uid) saveConfig(uid, { preferredPairs: pairs });
      },
      setAvoidPairs: (pairs) => {
        set({ avoidPairs: pairs });
        const uid = get().userId;
        if (uid) saveConfig(uid, { avoidPairs: pairs });
      },
      setDnaMinSample: (n) => {
        const clamped = Math.max(5, Math.min(100, Math.floor(Number(n) || 10)));
        set({ dnaMinSample: clamped });
      },

      closeOrder: (id) => set((s) => ({ orders: s.orders.filter((o) => o.id !== id) })),
      seedOrders: () => {\        stopDemoMarketFeed();
n        // Mantido apenas por compatibilidade; o DEMO não cria ordens artificiais.\n      },\n      setMonitorTab: (monitorTab) => set({ monitorTab }),
      toggleFeedPaused: () => set((s) => ({ feedPaused: !s.feedPaused })),
      clearTicks: () => set({ ticks: [] }),
    }),
    {
      name: "bot4x-store-v1",
      storage: createJSONStorage(() => makeUserStorage(() => _currentUserId)),
      // Campos persistidos — ticks e _ticker são runtime
      partialize: (s) => ({
        userId: s.userId,
        mode: s.mode,
        totalCapital: s.totalCapital,
        allocationPct: s.allocationPct,
        leverage: s.leverage,
        profile: s.profile,
        slPct: s.slPct,
        tpPct: s.tpPct,
        dailyPnlPct: s.dailyPnlPct,
        trailingPeakPct: s.trailingPeakPct,
        history: s.history,
        orders: s.orders,
        preferredPairs: s.preferredPairs,
        avoidPairs: s.avoidPairs,
        monitorTab: s.monitorTab,
        ticksProcessed: s.ticksProcessed,
        circuitBreaker: s.circuitBreaker,
        dnaMinSample: s.dnaMinSample,
        demoRealVersion: s.demoRealVersion,
      }),
    },
  ),
);

// ─── AUTH LISTENER — atualiza userId ao login/logout ─────────────────────────
// Monte isso uma vez no entry-point da app (ex: __root.tsx ou App.tsx).
// Aqui já inicializamos com o usuário atual se já estiver logado.
supabase.auth.getSession().then(({ data }) => {
  const uid = data.session?.user?.id ?? null;
  _currentUserId = uid;
  useBot4xStore.getState().setUserId(uid);
});

supabase.auth.onAuthStateChange((event, session) => {
  const uid = session?.user?.id ?? null;
  _currentUserId = uid;
  useBot4xStore.getState().setUserId(uid);

  // Ao fazer logout: encerra ticker/WS antes de zerar o estado em memória
  // para evitar memory leaks e callbacks rodando contra um store já limpo.
  if (event === "SIGNED_OUT") {
    useBot4xStore.getState().cleanup();
    useBot4xStore.setState({
      userId: null,
      history: [],
      orders: [],
      dailyPnlPct: 0,
      trailingPeakPct: 0,
      ticksProcessed: 0,
      circuitBreaker: "none",
      status: "IDLE",
      realInited: false,
      errorMsg: null,
    });
  }
});


// ─── SELECTORS ────────────────────────────────────────────────────────────────

export function selectActiveCapital(s: State) {
  return +(s.totalCapital * (s.allocationPct / 100)).toFixed(2);
}
export function selectSlotSize(s: State) {
  return +(selectActiveCapital(s) * RISK_PER_SLOT).toFixed(2);
}
