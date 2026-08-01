// Server functions de DNA.
// Porta DnaController do Nest (GET profile/heatmap/evolution/bot4x-compatibility).
// POST calculate/:userId (escrita) fica para a Fase 3.
//
// Regra SEC (Fase R): userId vem SEMPRE de context.userId; nunca aceitamos
// userId por path/body. Isso fecha o IDOR onde o Nest exigia assertOwnerOrAdmin.
// Aqui simplesmente não há como pedir "DNA de outro usuário".
//
// Fonte no Nest: DnaCalculatorService (originalmente mock). Portamos lendo
// as tabelas reais dna_profiles + dna_learning_events. Quando não há perfil
// ainda calculado, retornamos defaults honestos (null / arrays vazios), NÃO
// dados sintéticos.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export interface DnaProfileDTO {
  userId: string;
  temperament: string | null;
  score: number | null;
  riskAppetite: number | null;
  patienceScore: number | null;
  data: Json | null;
  updatedAt: string | null;
}

export interface DnaHeatmapDTO {
  userId: string;
  /** Distribuição de eventos por tipo, normalizada 0..1. */
  data: Array<{ eventType: string; weight: number; count: number }>;
}

export interface DnaEvolutionDTO {
  userId: string;
  history: Array<{ at: string; eventType: string; weight: number }>;
}

export interface DnaCompatibilityDTO {
  userId: string;
  /** 0..1 — quão compatível o DNA atual está com o perfil do bot4x. */
  compatibility: number;
  reason: string;
}

export const getDnaProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DnaProfileDTO> => {
    const { parseDnaProfileRow, DnaFormatError } = await import("@/lib/dna-schema");
    const { data, error } = await context.supabase
      .from("dna_profiles")
      .select("temperament,score,risk_appetite,patience_score,data,updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) console.warn("[dna.functions] getDnaProfile error:", error.message);
    try {
      const row = parseDnaProfileRow(data);
      return { userId: context.userId, ...row } as DnaProfileDTO;
    } catch (e) {
      if (e instanceof DnaFormatError) {
        console.warn("[dna.functions] getDnaProfile schema mismatch:", e.message);
        throw e;
      }
      throw e;
    }
  });


export const getDnaHeatmap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DnaHeatmapDTO> => {
    const { data, error } = await context.supabase
      .from("dna_learning_events")
      .select("event_type,weight")
      .eq("user_id", context.userId)
      .limit(1000);
    if (error) {
      console.warn("[dna.functions] getDnaHeatmap error:", error.message);
      return { userId: context.userId, data: [] };
    }
    const buckets = new Map<string, { weight: number; count: number }>();
    for (const row of data ?? []) {
      const key = String((row as { event_type: string }).event_type);
      const w = Number((row as { weight: number | null }).weight ?? 0);
      const cur = buckets.get(key) ?? { weight: 0, count: 0 };
      buckets.set(key, { weight: cur.weight + w, count: cur.count + 1 });
    }
    const maxWeight = Math.max(1, ...Array.from(buckets.values()).map((b) => b.weight));
    return {
      userId: context.userId,
      data: Array.from(buckets.entries()).map(([eventType, b]) => ({
        eventType,
        weight: b.weight / maxWeight,
        count: b.count,
      })),
    };
  });

export const getDnaEvolution = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DnaEvolutionDTO> => {
    const { data, error } = await context.supabase
      .from("dna_learning_events")
      .select("created_at,event_type,weight")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      console.warn("[dna.functions] getDnaEvolution error:", error.message);
      return { userId: context.userId, history: [] };
    }
    return {
      userId: context.userId,
      history: (data ?? []).map((r) => ({
        at: String((r as { created_at: string }).created_at),
        eventType: String((r as { event_type: string }).event_type),
        weight: Number((r as { weight: number | null }).weight ?? 0),
      })),
    };
  });

/**
 * GET /dna/bot4x-compatibility — compatibilidade entre o perfil de DNA e o
 * profile ativo no bot4x_configs. Regra simples e explicável: se ambos
 * existem e são do mesmo "temperamento" → 1.0; se diferentes → 0.5; se um
 * dos lados está vazio → 0. Substitui o mock do Nest sem inventar métrica
 * quantitativa nova.
 */
export const getBot4xCompatibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DnaCompatibilityDTO> => {
    const [{ data: dna }, { data: cfg }] = await Promise.all([
      context.supabase
        .from("dna_profiles")
        .select("temperament")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("bot4x_configs")
        .select("profile")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    const dnaTemp = ((dna?.temperament as string | null) ?? "").toUpperCase();
    const botProfile = ((cfg?.profile as string | null) ?? "").toUpperCase();
    if (!dnaTemp || !botProfile) {
      return {
        userId: context.userId,
        compatibility: 0,
        reason: !dnaTemp ? "DNA ainda não calculado." : "Bot sem profile configurado.",
      };
    }
    if (dnaTemp === botProfile) {
      return {
        userId: context.userId,
        compatibility: 1,
        reason: `Perfis alinhados: ${dnaTemp}.`,
      };
    }
    return {
      userId: context.userId,
      compatibility: 0.5,
      reason: `DNA=${dnaTemp} vs Bot=${botProfile} — considere ajustar o profile.`,
    };
  });

// =========================================================================
// Fase 3 — recalculateDnaProfile
// Agrega os dna_learning_events do usuário e faz upsert em dna_profiles.
// Regra: por padrão recalcula o próprio DNA (context.userId). Admin pode
// passar targetUserId para recalcular o de outro usuário (via has_role).
// Substitui o mock do DnaCalculatorService do Nest com heurística simples e
// determinística — sem inventar métricas quantitativas novas.
// =========================================================================

function classifyTemperament(scoreAvg: number): string {
  if (scoreAvg >= 0.5) return "AGGRESSIVE";
  if (scoreAvg >= 0) return "MODERATE";
  return "CONSERVATIVE";
}

export const recalculateDnaProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { targetUserId?: string }) =>
    z.object({ targetUserId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<DnaProfileDTO> => {
    const target = data.targetUserId ?? context.userId;

    if (target !== context.userId) {
      const { data: isAdmin, error: rErr } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (rErr) throw new Error("Falha ao verificar permissões");
      if (!isAdmin) throw new Error("Acesso negado: requer papel admin");
    }

    // Agrega eventos (limita a 5k pra proteger CPU do Worker).
    const { data: events, error: eErr } = await context.supabase
      .from("dna_learning_events")
      .select("weight,event_type")
      .eq("user_id", target)
      .limit(5000);
    if (eErr) throw new Error(eErr.message);

    const rows = events ?? [];
    const total = rows.length;
    const sumW = rows.reduce((s: number, r: any) => s + Number(r.weight ?? 0), 0);
    const avgW = total > 0 ? sumW / total : 0;

    // Score consolidado 0..100 (mapeia avg de -1..1 para 0..100).
    const score = Math.round(((avgW + 1) / 2) * 100);
    const wins = rows.filter((r: any) => Number(r.weight) > 0).length;
    const losses = rows.filter((r: any) => Number(r.weight) < 0).length;
    const patienceScore = total > 0 ? Math.round(((total - losses) / total) * 100) : 0;
    const riskAppetite = Math.max(0, Math.min(100, Math.round(50 + avgW * 50)));
    const temperament = classifyTemperament(avgW);

    // Escrita direta na tabela do usuário: a RLS já bloqueia targets alheios
    // pra não-admins; admin recai em supabaseAdmin.
    let updater = context.supabase;
    if (target !== context.userId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      updater = supabaseAdmin;
    }

    const { data: upserted, error: uErr } = await updater
      .from("dna_profiles")
      .upsert(
        {
          user_id: target,
          temperament,
          score,
          risk_appetite: riskAppetite,
          patience_score: patienceScore,
          data: { totalEvents: total, wins, losses, avgWeight: avgW },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("temperament,score,risk_appetite,patience_score,data,updated_at")
      .single();
    if (uErr) throw new Error("Falha ao gravar DNA: " + uErr.message);

    await context.supabase.from("event_log").insert({
      user_id: context.userId,
      event_type: "dna.recalculated",
      source: "dna.functions",
      payload: { targetUserId: target, totalEvents: total, score },
    });

    return {
      userId: target,
      temperament: upserted.temperament as string | null,
      score: upserted.score != null ? Number(upserted.score) : null,
      riskAppetite: upserted.risk_appetite != null ? Number(upserted.risk_appetite) : null,
      patienceScore: upserted.patience_score != null ? Number(upserted.patience_score) : null,
      data: (upserted.data as Json | null) ?? null,
      updatedAt: (upserted.updated_at as string | null) ?? null,
    };
  });
