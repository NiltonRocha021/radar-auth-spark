// UI-only local state. Persistência real fica nas server fns (alerts.functions.ts).
// Mantido para: input controlado de asset, modal do Telegram, etc.
import { create } from "zustand";

type UIState = {
  telegramModalOpen: boolean;
  setTelegramModalOpen: (v: boolean) => void;
};

export const useAlertsUIStore = create<UIState>((set) => ({
  telegramModalOpen: false,
  setTelegramModalOpen: (v) => set({ telegramModalOpen: v }),
}));

// -------- tipos re-exportados para os componentes existentes --------
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
