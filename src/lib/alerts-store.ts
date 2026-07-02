// UI-local state for the Alerts page controls (channels, types, quiet hours…).
// Persistência real vive em `alerts.functions.ts` + `alerts-hooks.ts`.
// A página hidrata este store a partir do server no mount.
import { create } from "zustand";

export type AlertType =
  | "signal_high"
  | "signal_any"
  | "manipulation"
  | "fake_breakout"
  | "stop_hunt"
  | "volatility"
  | "trend_change"
  | "setup_confirmed"
  | "market_open"
  | "sentiment";

export type Frequency = "realtime" | "15min" | "hourly" | "daily";

export type FeedItem = {
  id: string;
  kind: "manipulation" | "signal" | "volatility" | "profit" | "system";
  type: string;
  asset: string;
  description: string;
  at: number;
  read: boolean;
};

type Channels = {
  telegram: { on: boolean; username: string | null };
  email: { on: boolean; address: string };
  push: { on: boolean };
  discord: { on: boolean; webhook: string };
  whatsapp: { on: boolean };
};

type State = {
  channels: Channels;
  types: Record<AlertType, boolean>;
  minScore: number;
  frequency: Frequency;
  quietHours: { on: boolean; from: string; to: string };
  assets: string[];
  bot4x: boolean;
  feed: FeedItem[]; // legado — hoje o feed real vem via useAlertFeed()
};

type Actions = {
  hydrate: (patch: Partial<State>) => void;
  toggleChannel: (k: keyof Channels) => void;
  setChannelField: <K extends keyof Channels>(k: K, patch: Partial<Channels[K]>) => void;
  toggleType: (t: AlertType) => void;
  setMinScore: (n: number) => void;
  setFrequency: (f: Frequency) => void;
  setQuiet: (patch: Partial<State["quietHours"]>) => void;
  setAssets: (a: string[]) => void;
  toggleBot4x: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearFeed: () => void;
  pushFeed: (i: FeedItem) => void;
};

export const useAlertsStore = create<State & Actions>((set) => ({
  channels: {
    telegram: { on: false, username: null },
    email: { on: true, address: "" },
    push: { on: false },
    discord: { on: false, webhook: "" },
    whatsapp: { on: false },
  },
  types: {
    signal_high: true,
    signal_any: false,
    manipulation: true,
    fake_breakout: true,
    stop_hunt: true,
    volatility: true,
    trend_change: true,
    setup_confirmed: true,
    market_open: false,
    sentiment: false,
  },
  minScore: 70,
  frequency: "realtime",
  quietHours: { on: false, from: "22:00", to: "07:00" },
  assets: [],
  bot4x: true,
  feed: [],

  hydrate: (patch) => set((s) => ({ ...s, ...patch })),
  toggleChannel: (k) =>
    set((s) => ({ channels: { ...s.channels, [k]: { ...s.channels[k], on: !s.channels[k].on } } })),
  setChannelField: (k, patch) =>
    set((s) => ({ channels: { ...s.channels, [k]: { ...s.channels[k], ...patch } } })),
  toggleType: (t) => set((s) => ({ types: { ...s.types, [t]: !s.types[t] } })),
  setMinScore: (n) => set({ minScore: n }),
  setFrequency: (f) => set({ frequency: f }),
  setQuiet: (patch) => set((s) => ({ quietHours: { ...s.quietHours, ...patch } })),
  setAssets: (a) => set({ assets: a }),
  toggleBot4x: () => set((s) => ({ bot4x: !s.bot4x })),
  markRead: (id) => set((s) => ({ feed: s.feed.map((f) => (f.id === id ? { ...f, read: true } : f)) })),
  markAllRead: () => set((s) => ({ feed: s.feed.map((f) => ({ ...f, read: true })) })),
  clearFeed: () => set({ feed: [] }),
  pushFeed: (i) => set((s) => ({ feed: [i, ...s.feed].slice(0, 50) })),
}));
