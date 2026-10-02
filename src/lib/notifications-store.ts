import { create } from "zustand";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "./logger";

export type NotifType = "EXECUTE" | "EMERGENCY_SHUTDOWN" | "PROFIT_LOCK" | "ALERT" | "INFO";

const CriticalNotificationSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(["EMERGENCY_SHUTDOWN", "PROFIT_LOCK"]),
  title: z.string().min(1).max(500),
  body: z.string().max(5000).optional(),
  createdAt: z.number().int().positive(),
});

export const persistCriticalNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CriticalNotificationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const [{ supabaseAdmin }, { enforceRateLimit }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./rate-limit.server"),
    ]);
    await enforceRateLimit(context.userId, "notifications.critical", 30, 60);

    const { error: notificationError } = await supabaseAdmin
      .from("user_notifications")
      .upsert(
        {
          id: data.id,
          user_id: context.userId,
          type: data.type,
          title: data.title,
          body: data.body ?? null,
          read: false,
          dismissed: false,
        },
        { onConflict: "id" },
      );

    if (notificationError) {
      throw new Error(`Falha ao persistir notificação crítica: ${notificationError.message}`);
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        worst_session: JSON.stringify({
          type: data.type,
          title: data.title,
          ts: new Date(data.createdAt).toISOString(),
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.userId);

    if (profileError) {
      throw new Error(`Falha ao registrar evento crítico: ${profileError.message}`);
    }
  });

export type NotifEvent = {
  id: string;
  type: NotifType;
  title: string;
  body?: string;
  createdAt: number;
  read: boolean;
  persistent?: boolean;
};

// Tipos persistidos no banco (estado read/dismiss sobrevive entre sessões)
const PERSISTENT_TYPES: NotifType[] = ["EMERGENCY_SHUTDOWN", "PROFIT_LOCK"];
const isPersistent = (t: NotifType) => PERSISTENT_TYPES.includes(t);

type State = {
  events: NotifEvent[];
  push: (e: Omit<NotifEvent, "id" | "createdAt" | "read">) => NotifEvent;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clear: () => void;
  hydrateFromDb: (userId: string) => Promise<void>;
};

let counter = 0;
let currentUserId: string | null = null;

const WELCOME: NotifEvent = {
  id: "n0",
  type: "INFO",
  title: "Bem-vindo ao AISignalRadar",
  body: "Suas notificações Bot4x aparecerão aqui.",
  createdAt: Date.now() - 1000 * 60 * 8,
  read: true,
};

export const useNotificationsStore = create<State>((set, get) => ({
  events: [WELCOME],

  push: (e) => {
    const ev: NotifEvent = {
      ...e,
      id: `n${Date.now()}-${++counter}`,
      createdAt: Date.now(),
      read: false,
      persistent: isPersistent(e.type),
    };
    set((s) => ({ events: [ev, ...s.events].slice(0, 30) }));

    if (isPersistent(e.type) && currentUserId) {
      persistCriticalNotification({
        data: {
          id: ev.id,
          type: ev.type,
          title: ev.title,
          body: ev.body,
          createdAt: ev.createdAt,
        },
      }).catch((error) => {
        logger.error("[notifications] critical event", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    return ev;
  },

  markAllRead: () => {
    const toPersist = get().events.filter((e) => isPersistent(e.type) && !e.read);
    set((s) => ({ events: s.events.map((e) => ({ ...e, read: true })) }));
    if (currentUserId && toPersist.length > 0) {
      const uid = currentUserId;
      supabase
        .from("user_notifications")
        .update({ read: true })
        .eq("user_id", uid)
        .eq("read", false)
        .then(({ error }) => {
          if (error) logger.error("[notifications] markAllRead", { error: error, message: error.message });
        });
    }
  },

  dismiss: (id) => {
    const target = get().events.find((e) => e.id === id);
    set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
    if (currentUserId && target && isPersistent(target.type)) {
      const uid = currentUserId;
      supabase
        .from("user_notifications")
        .update({ dismissed: true })
        .eq("user_id", uid)
        .eq("id", id)
        .then(({ error }) => {
          if (error) logger.error("[notifications] dismiss", { error: error, message: error.message });
        });
    }
  },

  clear: () => {
    const hadPersistent = get().events.some((e) => isPersistent(e.type));
    set({ events: [] });
    if (currentUserId && hadPersistent) {
      const uid = currentUserId;
      supabase
        .from("user_notifications")
        .update({ dismissed: true })
        .eq("user_id", uid)
        .eq("dismissed", false)
        .then(({ error }) => {
          if (error) logger.error("[notifications] clear", { error: error, message: error.message });
        });
    }
  },

  hydrateFromDb: async (userId) => {
    const { data, error } = await supabase
      .from("user_notifications")
      .select("id, type, title, body, created_at, read, dismissed")
      .eq("user_id", userId)
      .eq("dismissed", false)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      logger.error("[notifications] hydrate", { error: error, message: error.message });
      return;
    }
    const persisted: NotifEvent[] = (data ?? []).map((r) => ({
      id: r.id,
      type: r.type as NotifType,
      title: r.title,
      body: r.body ?? undefined,
      createdAt: new Date(r.created_at).getTime(),
      read: r.read,
      persistent: true,
    }));
    set((s) => {
      // Mantém eventos transitórios atuais e injeta os persistidos sem duplicar IDs
      const existingIds = new Set(persisted.map((e) => e.id));
      const transient = s.events.filter((e) => !isPersistent(e.type) || !existingIds.has(e.id));
      const merged = [...persisted, ...transient]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 30);
      return { events: merged };
    });
  },
}));

// Sincroniza userId atual e hidrata ao logar; limpa ao deslogar
supabase.auth.getSession().then(({ data }) => {
  const uid = data.session?.user?.id ?? null;
  currentUserId = uid;
  if (uid) useNotificationsStore.getState().hydrateFromDb(uid);
});

supabase.auth.onAuthStateChange((event, session) => {
  const uid = session?.user?.id ?? null;
  currentUserId = uid;
  if (uid && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED")) {
    useNotificationsStore.getState().hydrateFromDb(uid);
  }
  if (event === "SIGNED_OUT") {
    useNotificationsStore.setState({ events: [WELCOME] });
  }
});
