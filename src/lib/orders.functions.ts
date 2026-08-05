// Server functions da Fase 3 — Orders (DEMO agora, LIVE reservado p/ Fase 4).
// Porta OrderController do Nest (place/close/list) sem executar contra exchange
// real. O contrato inclui `mode` desde já (default 'DEMO') para que a Fase 4
// só precise emitir orders com mode='LIVE' via mesmo pipeline, sem migration
// de rename/merge de tabela.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SIDES = ["BUY", "SELL"] as const;
const ORDER_TYPES = ["MARKET", "LIMIT"] as const;
const MODES = ["DEMO", "LIVE"] as const;

export interface OrderDTO {
  id: string;
  mode: "DEMO" | "LIVE";
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT";
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  pnl: number | null;
  pnlPct: number | null;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  signalId: string | null;
  openedAt: string;
  closedAt: string | null;
}

type OrderRow = {
  id: string;
  mode: "DEMO" | "LIVE";
  symbol: string;
  side: "BUY" | "SELL";
  order_type: "MARKET" | "LIMIT";
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  signal_id: string | null;
  opened_at: string;
  closed_at: string | null;
};

function toDto(r: OrderRow): OrderDTO {
  return {
    id: r.id,
    mode: r.mode,
    symbol: r.symbol,
    side: r.side,
    orderType: r.order_type,
    quantity: Number(r.quantity),
    entryPrice: Number(r.entry_price),
    exitPrice: r.exit_price != null ? Number(r.exit_price) : null,
    stopLoss: r.stop_loss != null ? Number(r.stop_loss) : null,
    takeProfit: r.take_profit != null ? Number(r.take_profit) : null,
    pnl: r.pnl != null ? Number(r.pnl) : null,
    pnlPct: r.pnl_pct != null ? Number(r.pnl_pct) : null,
    status: r.status,
    signalId: r.signal_id,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
  };
}

// ---------- placeOrder (DEMO | LIVE) ---------------------------------------
// Fase 4: mode='LIVE' executa de fato contra a Binance dentro do Worker
// (src/lib/binance.server.ts, import dinâmico p/ não vazar ao bundle client).
// Guardas para LIVE: 2FA verificado + credenciais Binance configuradas.

export const placeDemoOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        symbol: z.string().trim().min(3).max(20).toUpperCase(),
        side: z.enum(SIDES),
        orderType: z.enum(ORDER_TYPES).default("MARKET"),
        quantity: z.number().positive(),
        entryPrice: z.number().positive(),
        stopLoss: z.number().positive().optional(),
        takeProfit: z.number().positive().optional(),
        signalId: z.string().uuid().optional(),
        mode: z.enum(MODES).default("DEMO"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<OrderDTO> => {
    let entryPrice = data.entryPrice;
    let quantity = data.quantity;

    if (data.mode === "LIVE") {
      const { data: tfa } = await context.supabase
        .from("user_two_factor")
        .select("enabled")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!tfa?.enabled) {
        throw new Error("Ative o 2FA antes de operar em modo LIVE.");
      }

      const { placeBinanceOrder, isLiveTradingConfigured } = await import("./binance.server");
      if (!isLiveTradingConfigured()) {
        throw new Error("Execução LIVE indisponível: credenciais da Binance não configuradas.");
      }

      const fill = await placeBinanceOrder({
        symbol: data.symbol,
        side: data.side,
        orderType: data.orderType,
        quantity: data.quantity,
        price: data.orderType === "LIMIT" ? data.entryPrice : undefined,
      });
      if (fill.avgPrice > 0) entryPrice = fill.avgPrice;
      if (fill.executedQty > 0) quantity = fill.executedQty;
    }

    const { data: row, error } = await context.supabase
      .from("orders")
      .insert({
        user_id: context.userId,
        mode: data.mode,
        symbol: data.symbol,
        side: data.side,
        order_type: data.orderType,
        quantity,
        entry_price: entryPrice,
        stop_loss: data.stopLoss ?? null,
        take_profit: data.takeProfit ?? null,
        signal_id: data.signalId ?? null,
        status: "OPEN",
      })
      .select("*")
      .single();
    if (error) throw new Error("Falha ao registrar ordem: " + error.message);
    return toDto(row as OrderRow);
  });

/** Alias explícito para a Fase 4 — mesmo pipeline, aceita mode='LIVE'. */
export const placeOrder = placeDemoOrder;

// ---------- closeDemoOrder -------------------------------------------------
// pnl mock derivado do market_snapshot (preço corrente). Fase 4 substituirá
// pelo fill real do exchange.

export const closeDemoOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; exitPrice?: number }) =>
    z
      .object({ orderId: z.string().uuid(), exitPrice: z.number().positive().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<OrderDTO> => {
    const { data: order, error: oErr } = await context.supabase
      .from("orders")
      .select("*")
      .eq("id", data.orderId)
      .eq("user_id", context.userId) // defesa em profundidade além da RLS
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) throw new Error("Ordem não encontrada");
    if (order.status !== "OPEN") throw new Error("Ordem já encerrada");

    let exit = data.exitPrice;
    if (exit == null) {
      const { data: snap } = await context.supabase
        .from("market_snapshot")
        .select("price")
        .eq("symbol", (order as OrderRow).symbol)
        .maybeSingle();
      exit = snap?.price != null ? Number(snap.price) : Number((order as OrderRow).entry_price);
    }
    const qty = Number((order as OrderRow).quantity);
    const entry = Number((order as OrderRow).entry_price);
    const dir = (order as OrderRow).side === "BUY" ? 1 : -1;
    const pnl = (exit - entry) * qty * dir;
    const pnlPct = entry > 0 ? ((exit - entry) / entry) * 100 * dir : 0;

    const { data: updated, error: uErr } = await context.supabase
      .from("orders")
      .update({
        status: "CLOSED",
        exit_price: exit,
        pnl,
        pnl_pct: pnlPct,
        closed_at: new Date().toISOString(),
      })
      .eq("id", data.orderId)
      .select("*")
      .single();
    if (uErr) throw new Error(uErr.message);
    return toDto(updated as OrderRow);
  });

// ---------- listOrders -----------------------------------------------------

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { status?: "OPEN" | "CLOSED" | "CANCELLED"; mode?: "DEMO" | "LIVE"; limit?: number }) =>
    z
      .object({
        status: z.enum(["OPEN", "CLOSED", "CANCELLED"]).optional(),
        mode: z.enum(MODES).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<OrderDTO[]> => {
    let q = context.supabase
      .from("orders")
      .select("*")
      .eq("user_id", context.userId)
      .order("opened_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.status) q = q.eq("status", data.status);
    if (data.mode) q = q.eq("mode", data.mode);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => toDto(r as OrderRow));
  });
