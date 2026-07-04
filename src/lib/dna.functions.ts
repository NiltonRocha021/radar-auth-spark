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
    const { data, error } = await context.supabase
      .from("dna_profiles")
      .select("temperament,score,risk_appetite,patience_score,data,updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) console.warn("[dna.functions] getDnaProfile error:", error.message);
    return {
      userId: context.userId,
      temperament: (data?.temperament as string | null) ?? null,
      score: data?.score != null ? Number(data.score) : null,
      riskAppetite: data?.risk_appetite != null ? Number(data.risk_appetite) : null,
      patienceScore: data?.patience_score != null ? Number(data.patience_score) : null,
      data: (data?.data as Json | null) ?? null,
      updatedAt: (data?.updated_at as string | null) ?? null,
    };
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
