import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

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

// Tipos que devem ser registrados no banco (circuit breakers críticos)
const PERSISTENT_TYPES: NotifType[] = ["EMERGENCY_SHUTDOWN", "PROFIT_LOCK"];

type State = {
  events: NotifEvent[];
  push: (e: Omit<NotifEvent, "id" | "createdAt" | "read">) => NotifEvent;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

let counter = 0;

export const useNotificationsStore = create<State>((set, get) => ({
  events: [
    {
      id: "n0",
      type: "INFO",
      title: "Bem-vindo ao AISignalRadar",
      body: "Suas notificações Bot4x aparecerão aqui.",
      createdAt: Date.now() - 1000 * 60 * 8,
      read: true,
    },
  ],

  push: (e) => {
    const ev: NotifEvent = {
      ...e,
      id: `n${Date.now()}-${++counter}`,
      createdAt: Date.now(),
      read: false,
    };
    set((s) => ({ events: [ev, ...s.events].slice(0, 30) }));

    // Persiste notificações críticas no perfil do usuário
    // (worst_session = último evento crítico; operations_today = contador acumulado)
    if (PERSISTENT_TYPES.includes(e.type)) {
      supabase.auth.getUser().then(({ data }) => {
        const uid = data.user?.id;
        if (!uid) return;
        const logEntry = JSON.stringify({
          type: e.type,
          title: e.title,
          ts: new Date().toISOString(),
        });
        const criticalCount = get().events.filter((ev) => PERSISTENT_TYPES.includes(ev.type)).length;
        supabase
          .from("profiles")
          .update({
            worst_session: logEntry,
            operations_today: criticalCount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", uid)
          .then(({ error }) => {
            if (error) console.error("[notifications] persist:", error.message);
          });
      });
    }
    return ev;
  },

  markAllRead: () => set((s) => ({ events: s.events.map((ev) => ({ ...ev, read: true })) })),
  dismiss: (id) => set((s) => ({ events: s.events.filter((ev) => ev.id !== id) })),
  clear: () => set({ events: [] }),
}));
