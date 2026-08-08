// Schemas Zod defensivos para linhas vindas do Postgres.
//
// Motivo: o client tipado do Supabase confia no schema gerado, mas o dado real
// pode divergir (colunas nulas, enums fora do domínio, migrations parciais).
// Aqui validamos a *forma* da linha antes de mapear para DTO — linhas inválidas
// são descartadas com log estruturado em vez de vazar `NaN`/`undefined` para a UI.
import { z } from "zod";
import { logger } from "./logger";

/** Número tolerante: aceita number, string numérica e null. */
const num = z.union([z.number(), z.string()]).nullable().optional().transform((v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
});

const bool = z.union([z.boolean(), z.null()]).optional().transform((v) => v ?? null);
const str = z.union([z.string(), z.null()]).optional().transform((v) => v ?? null);

export const signalRowSchema = z.object({
  id: z.string().min(1),
  pair: str,
  side: str,
  score: num,
  ai_score: num,
  entry_price: num,
  stop_loss: num,
  take_profit1: num,
  take_profit2: num,
  timeframe: str,
  status: str,
  channel_zone: str,
  rsi: num,
  liquidity_grab: bool,
  ai_reasoning: str,
  confirmations: str,
  invalidations: str,
  expires_at: str,
  created_at: str,
  updated_at: str,
});
export type SignalRowParsed = z.infer<typeof signalRowSchema>;

export const manipulationAlertRowSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  alert_type: z.string().min(1),
  severity: z.string().min(1),
  message: str,
  data: z.unknown().nullable().optional(),
  detected_at: str,
  created_at: str,
});
export type ManipulationAlertRowParsed = z.infer<typeof manipulationAlertRowSchema>;

export const ohlcvRowSchema = z.object({
  open_time: z.union([z.string(), z.number()]).nullable().optional(),
  high: num,
  low: num,
  close: num,
});
export type OhlcvRowParsed = z.infer<typeof ohlcvRowSchema>;

/** Vela só é utilizável se high/low/close forem numéricos coerentes. */
export const usableOhlcvSchema = ohlcvRowSchema.refine(
  (r) => r.high !== null && r.low !== null && r.close !== null && r.high >= r.low,
  { message: "candle incompleto ou incoerente" },
);

/**
 * Valida uma lista de linhas, descartando (e logando) as inválidas.
 * Nunca lança — retorna sempre um array das linhas válidas.
 */
export function parseRows<S extends z.ZodTypeAny>(
  schema: S,
  rows: unknown[] | null | undefined,
  source: string,
): z.infer<S>[] {
  if (!rows?.length) return [];
  const ok: z.infer<S>[] = [];
  let dropped = 0;
  const samples: string[] = [];
  for (const row of rows) {
    const res = schema.safeParse(row);
    if (res.success) ok.push(res.data);
    else {
      dropped++;
      if (samples.length < 3) samples.push(res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
  }
  if (dropped > 0) {
    logger.warn(`[db-validation] linhas inválidas descartadas em ${source}`, {
      source,
      dropped,
      total: rows.length,
      samples,
    });
  }
  return ok;
}

/** Versão single-row: retorna null quando a linha não bate com o schema. */
export function parseRow<S extends z.ZodTypeAny>(
  schema: S,
  row: unknown,
  source: string,
): z.infer<S> | null {
  if (row === null || row === undefined) return null;
  const res = schema.safeParse(row);
  if (res.success) return res.data;
  logger.warn(`[db-validation] linha inválida em ${source}`, {
    source,
    issues: res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  });
  return null;
}
