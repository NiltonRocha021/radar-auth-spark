// Server functions da área Admin.
// Autorização: requireSupabaseAuth + checagem de papel 'admin' via has_role.
// Escritas em plan_tier passam por supabaseAdmin (service_role) porque o
// trigger prevent_plan_tier_self_escalation bloqueia qualquer outro role.
// Toda mudança é registrada em admin_audit_log.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLAN_TIERS = ["free", "pro", "elite"] as const;

const EDITABLE_FIELDS = ["full_name", "username", "bio", "country", "plan_tier"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Falha ao verificar permissões");
  if (!data) throw new Error("Acesso negado: requer papel admin");
}

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; limit?: number }) =>
    z.object({ search: z.string().trim().max(120).optional(), limit: z.number().int().min(1).max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const limit = data.limit ?? 50;
    let q = context.supabase
      .from("profiles")
      .select("id,email,username,full_name,plan_tier,country,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`email.ilike.${s},username.ilike.${s},full_name.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { users: rows ?? [] };
  });

export const adminGetUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const [{ data: profile, error: pErr }, { data: roles }, { data: audit }] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", data.userId),
      context.supabase
        .from("admin_audit_log")
        .select("*")
        .eq("target_user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("Usuário não encontrado");
    return { profile, roles: (roles ?? []).map((r: { role: string }) => r.role), audit: audit ?? [] };
  });

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; updates: Partial<Record<EditableField, string | null>> }) =>
    z
      .object({
        userId: z.string().uuid(),
        updates: z
          .object({
            full_name: z.string().trim().max(120).nullable().optional(),
            username: z.string().trim().min(2).max(40).nullable().optional(),
            bio: z.string().trim().max(500).nullable().optional(),
            country: z.string().trim().max(60).nullable().optional(),
            plan_tier: z.enum(PLAN_TIERS).nullable().optional(),
          })
          .refine((u) => Object.keys(u).length > 0, "Nenhum campo informado"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    // Carrega valores antigos para auditoria
    const { data: before, error: bErr } = await context.supabase
      .from("profiles")
      .select("full_name,username,bio,country,plan_tier")
      .eq("id", data.userId)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!before) throw new Error("Usuário não encontrado");

    // plan_tier exige service_role (trigger bloqueia outros papéis).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uErr } = await supabaseAdmin
      .from("profiles")
      .update(data.updates)
      .eq("id", data.userId);
    if (uErr) throw new Error(uErr.message);

    const auditRows = (Object.keys(data.updates) as EditableField[])
      .filter((k) => (before as Record<string, unknown>)[k] !== data.updates[k])
      .map((field) => ({
        actor_id: context.userId,
        target_user_id: data.userId,
        table_name: "profiles",
        field_name: field,
        old_value: JSON.stringify((before as Record<string, unknown>)[field] ?? null),
        new_value: JSON.stringify(data.updates[field] ?? null),
      }));

    if (auditRows.length > 0) {
      await supabaseAdmin.from("admin_audit_log").insert(auditRows);
    }

    return { ok: true, changed: auditRows.length };
  });

// =========================================================================
// Fase 3 — Admin overview + listSubscribers
// =========================================================================

export interface AdminOverviewDTO {
  totalUsers: number;
  totalSubscribers: number;
  totalSignals: number;
  totalOrders: number;
  activeBots: number;
  planBreakdown: Array<{ plan: string; count: number }>;
}

export const adminGetOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverviewDTO> => {
    await assertAdmin(context);

    const [usersRes, subsRes, signalsRes, ordersRes, botsRes, plansRes] = await Promise.all([
      context.supabase.from("profiles").select("*", { count: "exact", head: true }),
      context.supabase.from("subscribers").select("*", { count: "exact", head: true }),
      context.supabase.from("signals").select("*", { count: "exact", head: true }),
      context.supabase.from("orders").select("*", { count: "exact", head: true }),
      context.supabase
        .from("bot_system_state")
        .select("*", { count: "exact", head: true })
        .eq("state", "ACTIVE"),
      context.supabase.from("profiles").select("plan_tier"),
    ]);

    const plans = new Map<string, number>();
    for (const r of (plansRes.data ?? []) as Array<{ plan_tier: string | null }>) {
      const key = r.plan_tier ?? "unknown";
      plans.set(key, (plans.get(key) ?? 0) + 1);
    }

    return {
      totalUsers: usersRes.count ?? 0,
      totalSubscribers: subsRes.count ?? 0,
      totalSignals: signalsRes.count ?? 0,
      totalOrders: ordersRes.count ?? 0,
      activeBots: botsRes.count ?? 0,
      planBreakdown: Array.from(plans.entries()).map(([plan, count]) => ({ plan, count })),
    };
  });

export const adminListSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { limit?: number; activeOnly?: boolean }) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).optional(),
        activeOnly: z.boolean().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("subscribers")
      .select("id,user_id,name,channel,target,active,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.activeOnly) q = q.eq("active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { subscribers: rows ?? [] };
  });

// =========================================================================
// Gestão de contas e permissões (criar perfil + conceder/revogar papéis)
// =========================================================================

const APP_ROLES = ["admin", "moderator", "user"] as const;
type AppRole = (typeof APP_ROLES)[number];

/** Cria uma conta (auth + profile) já confirmada, com plano e papéis opcionais. */
export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().email(),
        password: z.string().min(8).max(72),
        fullName: z.string().trim().max(120).optional(),
        username: z.string().trim().min(2).max(40).optional(),
        planTier: z.enum(PLAN_TIERS).default("free"),
        roles: z.array(z.enum(APP_ROLES)).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: data.fullName ? { full_name: data.fullName } : undefined,
    });
    if (cErr || !created?.user) throw new Error(cErr?.message ?? "Falha ao criar usuário");
    const newId = created.user.id;

    // O trigger handle_new_user já cria o profile; completamos os campos.
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({
        email: data.email,
        full_name: data.fullName ?? null,
        username: data.username ?? null,
        plan_tier: data.planTier,
      })
      .eq("id", newId);
    if (pErr) throw new Error(pErr.message);

    if (data.roles.length > 0) {
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert(data.roles.map((role) => ({ user_id: newId, role })));
      if (rErr) throw new Error(rErr.message);
    }

    await supabaseAdmin.from("admin_audit_log").insert([
      {
        actor_id: context.userId,
        target_user_id: newId,
        table_name: "profiles",
        field_name: "created",
        old_value: JSON.stringify(null),
        new_value: JSON.stringify({ email: data.email, plan_tier: data.planTier, roles: data.roles }),
      },
    ]);

    return { ok: true, userId: newId };
  });

/** Concede ou revoga um papel. Um admin não pode remover o próprio papel admin. */
export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(APP_ROLES),
        grant: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.grant && data.role === "admin" && data.userId === context.userId) {
      throw new Error("Você não pode remover o próprio papel de admin.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role as AppRole }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin.from("admin_audit_log").insert([
      {
        actor_id: context.userId,
        target_user_id: data.userId,
        table_name: "user_roles",
        field_name: data.role,
        old_value: JSON.stringify(data.grant ? null : data.role),
        new_value: JSON.stringify(data.grant ? data.role : null),
      },
    ]);

    return { ok: true };
  });
