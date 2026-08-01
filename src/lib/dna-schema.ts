// Schemas e parsing defensivo do DNA.
//
// Mora fora de `dna.functions.ts` de propósito: módulos que declaram
// `createServerFn` precisam ser wrappers finos (o code-splitting remove
// tudo o que não é a declaração da server fn).
import { z } from "zod";

/** Sub-métricas de gauge que o `dna-header` sabe ler. */
export const dnaMetricsSchema = z
  .object({
    dnaConsistency: z.number().finite().min(0).max(100).optional(),
    dnaDiscipline: z.number().finite().min(0).max(100).optional(),
    dnaRiskControl: z.number().finite().min(0).max(100).optional(),
    dnaTiming: z.number().finite().min(0).max(100).optional(),
    dnaEmotionalControl: z.number().finite().min(0).max(100).optional(),
    // Aliases legados vindos do backend antigo.
    consistency: z.number().finite().min(0).max(100).optional(),
    discipline: z.number().finite().min(0).max(100).optional(),
    riskControl: z.number().finite().min(0).max(100).optional(),
    timing: z.number().finite().min(0).max(100).optional(),
    emotionalControl: z.number().finite().min(0).max(100).optional(),
  })
  .passthrough();

export type DnaMetrics = z.infer<typeof dnaMetricsSchema>;

/** Linha crua de `dna_profiles` (colunas selecionadas). */
export const dnaProfileRowSchema = z.object({
  temperament: z.string().nullable().optional(),
  score: z.union([z.number(), z.string()]).nullable().optional(),
  risk_appetite: z.union([z.number(), z.string()]).nullable().optional(),
  patience_score: z.union([z.number(), z.string()]).nullable().optional(),
  data: z.unknown().optional(),
  updated_at: z.string().nullable().optional(),
});

export type DnaProfileRow = z.infer<typeof dnaProfileRowSchema>;

/** Erro controlado de formato — usado pela server fn e pela UI. */
export class DnaFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DnaFormatError";
  }
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/**
 * Valida a linha do banco e devolve os campos já normalizados.
 * Lança `DnaFormatError` quando o formato é incompatível (erro controlado,
 * com mensagem legível, em vez de um TypeError em runtime).
 */
export function parseDnaProfileRow(row: unknown): {
  temperament: string | null;
  score: number | null;
  riskAppetite: number | null;
  patienceScore: number | null;
  data: Record<string, unknown> | null;
  updatedAt: string | null;
} {
  const parsed = dnaProfileRowSchema.safeParse(row ?? {});
  if (!parsed.success) {
    throw new DnaFormatError(
      `Perfil de DNA em formato inesperado: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "root"} ${i.message}`)
        .join("; ")}`,
    );
  }
  const r = parsed.data;
  return {
    temperament: r.temperament ?? null,
    score: num(r.score),
    riskAppetite: num(r.risk_appetite),
    patienceScore: num(r.patience_score),
    data: parseDnaData(r.data),
    updatedAt: r.updated_at ?? null,
  };
}

/**
 * `data` pode vir como objeto (jsonb) ou string (texto JSON legado).
 * Qualquer coisa fora disso — string inválida, array, número — vira `null`
 * (fallback seguro), nunca uma exceção.
 */
export function parseDnaData(input: unknown): Record<string, unknown> | null {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Extrai as sub-métricas de gauge de forma tolerante: campos ausentes ou
 * fora de 0..100 são simplesmente descartados.
 */
export function extractDnaMetrics(input: unknown): {
  dnaConsistency?: number;
  dnaDiscipline?: number;
  dnaRiskControl?: number;
  dnaTiming?: number;
  dnaEmotionalControl?: number;
} {
  const obj = parseDnaData(input);
  if (!obj) return {};
  const parsed = dnaMetricsSchema.safeParse(obj);
  const m: DnaMetrics = parsed.success ? parsed.data : (obj as DnaMetrics);
  const pick = (a?: unknown, b?: unknown): number | undefined => {
    for (const v of [a, b]) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) return v;
    }
    return undefined;
  };
  const out: Record<string, number> = {};
  const c = pick(m.dnaConsistency, m.consistency);
  const d = pick(m.dnaDiscipline, m.discipline);
  const r = pick(m.dnaRiskControl, m.riskControl);
  const t = pick(m.dnaTiming, m.timing);
  const e = pick(m.dnaEmotionalControl, m.emotionalControl);
  if (c !== undefined) out.dnaConsistency = c;
  if (d !== undefined) out.dnaDiscipline = d;
  if (r !== undefined) out.dnaRiskControl = r;
  if (t !== undefined) out.dnaTiming = t;
  if (e !== undefined) out.dnaEmotionalControl = e;
  return out;
}
