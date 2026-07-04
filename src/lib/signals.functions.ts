// Server functions de leitura de sinais.
// Porta o SignalController do Nest (GET /signals, GET /signals/:id).
// Sinais são globais de mercado — a RLS da tabela `signals` cobre a política
// de acesso; NÃO filtramos por user_id aqui, replicando o contrato do Nest.
// POST /signals/feedback (escrita) fica para a Fase 3.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SignalListItemDTO {
  id: string;
  symbol: string;
  direction: "BUY" | "SELL";
  confidence: number;
  entry: number;
  sl?: number;
  tp?: number;
  tp2?: number;
  state: "active" | "closed" | "pending" | "expired";
  tf?: string;
  rsi?: number;
  channelZone?: string;
  liquidityGrab?: boolean;
  createdAt?: string;
  expiresAt?: string;
}

export interface SignalDetailDTO extends SignalListItemDTO {
  aiScore?: number;
  score?: number;
  aiReasoning?: string;
  confirmations?: string;
  invalidations?: string;
  updatedAt?: string;
}

function normalizeSide(side: string | null | undefined): "BUY" | "SELL" {
  const v = String(side ?? "").toUpperCase();
  return v === "SELL" || v === "SHORT" ? "SELL" : "BUY";
}

function normalizeState(status: string | null | undefined): SignalListItemDTO["state"] {
  const v = String(status ?? "active").toLowerCase();
  if (v === "closed" || v === "pending" || v === "expired") return v;
  return "active";
}

type SignalRow = {
  id: string;
  pair: string | null;
  side: string | null;
  score: number | null;
  ai_score: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit1: number | null;
  take_profit2: number | null;
  timeframe: string | null;
  status: string | null;
  channel_zone: string | null;
  rsi: number | null;
  liquidity_grab: boolean | null;
  ai_reasoning: string | null;
  confirmations: string | null;
  invalidations: string | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function toListItem(s: SignalRow): SignalListItemDTO {
  return {
    id: s.id,
    symbol: String(s.pair ?? ""),
    direction: normalizeSide(s.side),
    confidence: Number(s.ai_score ?? s.score ?? 0),
    entry: Number(s.entry_price ?? 0),
    sl: s.stop_loss != null ? Number(s.stop_loss) : undefined,
    tp: s.take_profit1 != null ? Number(s.take_profit1) : undefined,
    tp2: s.take_profit2 != null ? Number(s.take_profit2) : undefined,
    state: normalizeState(s.status),
    tf: s.timeframe ?? undefined,
    rsi: s.rsi != null ? Number(s.rsi) : undefined,
    channelZone: s.channel_zone ?? undefined,
    liquidityGrab: s.liquidity_grab ?? undefined,
    createdAt: s.created_at ?? undefined,
    expiresAt: s.expires_at ?? undefined,
  };
}

/**
 * GET /signals — porta de SignalController.getAllSignals.
 * Contrato Nest: retorna até 20 sinais mais recentes com o status pedido
 * (default "active"). Sem paginação por decisão de escopo.
 */
export const getSignalsList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { status?: string }) => ({
    status: input?.status ?? "active",
  }))
  .handler(async ({ data, context }): Promise<SignalListItemDTO[]> => {
    const { data: rows, error } = await context.supabase
      .from("signals")
      .select(
        "id,pair,side,score,ai_score,entry_price,stop_loss,take_profit1,take_profit2,timeframe,status,channel_zone,rsi,liquidity_grab,ai_reasoning,confirmations,invalidations,expires_at,created_at,updated_at",
      )
      .eq("status", data.status)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      console.warn("[signals.functions] getSignalsList error:", error.message);
      return [];
    }
    return (rows ?? []).map((r) => toListItem(r as SignalRow));
  });

/**
 * GET /signals/:id — porta de SignalController.getSignalById.
 * Retorna null (não 404) quando o sinal não existe, deixando a UI decidir
 * como renderizar — a semântica de "not found" via exception não atravessa
 * bem o boundary de createServerFn.
 */
export const getSignalById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id || typeof input.id !== "string") {
      throw new Error("id obrigatório");
    }
    return { id: input.id };
  })
  .handler(async ({ data, context }): Promise<SignalDetailDTO | null> => {
    const { data: row, error } = await context.supabase
      .from("signals")
      .select(
        "id,pair,side,score,ai_score,entry_price,stop_loss,take_profit1,take_profit2,timeframe,status,channel_zone,rsi,liquidity_grab,ai_reasoning,confirmations,invalidations,expires_at,created_at,updated_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) {
      console.warn("[signals.functions] getSignalById error:", error.message);
      return null;
    }
    if (!row) return null;
    const s = row as SignalRow;
    return {
      ...toListItem(s),
      aiScore: s.ai_score != null ? Number(s.ai_score) : undefined,
      score: s.score != null ? Number(s.score) : undefined,
      aiReasoning: s.ai_reasoning ?? undefined,
      confirmations: s.confirmations ?? undefined,
      invalidations: s.invalidations ?? undefined,
      updatedAt: s.updated_at ?? undefined,
    };
  });
