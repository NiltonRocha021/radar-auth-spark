// Server functions de leitura de alertas de manipulação.
// Sem controller Nest de origem — leitura direta da tabela manipulation_alerts
// (aprovada explicitamente no recorte da Fase 2 por ser leitura pura de dado
// já modelado, não feature nova).
//
// Alertas de manipulação são dados de mercado globais (não por usuário) — a
// RLS da tabela é quem decide o acesso. Não filtramos por user_id.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { manipulationAlertRowSchema, parseRows } from "@/lib/db-schemas";

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export interface ManipulationAlertDTO {
  id: string;
  symbol: string;
  alertType: string;
  severity: string;
  message: string;
  data: Json | null;
  detectedAt: string;
  createdAt: string;
}

/**
 * Lista os alertas mais recentes. Sem paginação por escopo — retorna até 50
 * eventos ordenados por detectedAt desc.
 */
export const listManipulationAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { symbol?: string; severity?: string }) => ({
    symbol: input?.symbol ? String(input.symbol).toUpperCase() : undefined,
    severity: input?.severity ? String(input.severity).toUpperCase() : undefined,
  }))
  .handler(async ({ data, context }): Promise<ManipulationAlertDTO[]> => {
    let query = context.supabase
      .from("manipulation_alerts")
      .select("id,symbol,alert_type,severity,message,data,detected_at,created_at")
      .order("detected_at", { ascending: false })
      .limit(50);
    if (data.symbol) query = query.eq("symbol", data.symbol);
    if (data.severity) query = query.eq("severity", data.severity);
    const { data: rows, error } = await query;
    if (error) {
      console.warn("[manipulation.functions] listManipulationAlerts error:", error.message);
      return [];
    }
    return (rows ?? []).map((r) => {
      const row = r as {
        id: string;
        symbol: string;
        alert_type: string;
        severity: string;
        message: string;
        data: Json | null;
        detected_at: string;
        created_at: string;
      };
      return {
        id: row.id,
        symbol: row.symbol,
        alertType: row.alert_type,
        severity: row.severity,
        message: row.message,
        data: row.data ?? null,
        detectedAt: row.detected_at,
        createdAt: row.created_at,
      };
    });
  });
