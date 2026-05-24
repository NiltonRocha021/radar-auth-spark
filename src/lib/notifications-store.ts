import { create } from "zustand";

export type NotifType = "EXECUTE" | "EMERGENCY_SHUTDOWN" | "PROFIT_LOCK" | "ALERT" | "INFO";

export type NotifEvent = {
  id: string;
  type: NotifType;
  title: string;
  body?: string;
  createdAt: number;
  read: boolean;
  persistent?: boolean;
};

type State = {
  events: NotifEvent[];
  push: (e: Omit<NotifEvent, "id" | "createdAt" | "read">) => NotifEvent;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

let counter = 0;

export const useNotificationsStore = create<State>((set) => ({
  events: [
    { id: "n0", type: "INFO", title: "Bem-vindo ao AISignalRadar", body: "Suas notificações Bot4x aparecerão aqui.", createdAt: Date.now() - 1000 * 60 * 8, read: true },
  ],
  push: (e) => {
    const ev: NotifEvent = { ...e, id: `n${Date.now()}-${++counter}`, createdAt: Date.now(), read: false };
    set((s) => ({ events: [ev, ...s.events].slice(0, 30) }));
    return ev;
  },
  markAllRead: () => set((s) => ({ events: s.events.map((e) => ({ ...e, read: true })) })),
  dismiss: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
  clear: () => set({ events: [] }),
}));
