// Histórico local de simulações do Calibrador.
// Persistido em localStorage. Não substitui nada do backend — é apenas registro do que o usuário rodou no frontend.
import type {
  SimulationProfile,
  SimulationResultUI,
} from "@/adapters/backend/calibrator.adapter";

export interface CalibratorHistoryEntry {
  id: string;
  createdAt: string; // ISO
  userId?: string;
  params: {
    profile: SimulationProfile;
    symbol: string;
    periodDays: number;
    initialBalance: number;
  };
  result: {
    trades: number;
    wins?: number;
    losses?: number;
    winRate: number;
    pnl: number;
    pnlPct: number;
    maxDrawdown: number;
    sharpe: number;
  };
  /** Snapshot completo do resultado para visualização detalhada. */
  fullResult?: SimulationResultUI;
}

const KEY = "calibrator.history.v1";
const MAX_ENTRIES = 100;

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): CalibratorHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: CalibratorHistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* quota or serialization error — ignore */
  }
  listeners.forEach((l) => l());
}

export const calibratorHistoryStore = {
  list(): CalibratorHistoryEntry[] {
    return read();
  },
  add(entry: Omit<CalibratorHistoryEntry, "id" | "createdAt"> & { createdAt?: string }) {
    const full: CalibratorHistoryEntry = {
      id:
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      createdAt: entry.createdAt ?? new Date().toISOString(),
      userId: entry.userId,
      params: entry.params,
      result: entry.result,
    };
    const next = [full, ...read()];
    write(next);
    return full;
  },
  remove(id: string) {
    write(read().filter((e) => e.id !== id));
  },
  clear() {
    write([]);
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function recordSimulation(
  userId: string | undefined,
  params: CalibratorHistoryEntry["params"],
  result: SimulationResultUI,
): CalibratorHistoryEntry {
  return calibratorHistoryStore.add({
    userId,
    params,
    result: {
      trades: result.trades,
      winRate: result.winRate,
      pnl: result.pnl,
      pnlPct: result.pnlPct,
      maxDrawdown: result.maxDrawdown,
      sharpe: result.sharpe,
    },
  });
}
