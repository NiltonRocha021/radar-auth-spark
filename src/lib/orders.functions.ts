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

// ---------- closeOrder (DEMO | LIVE) ---------------------------------------
// DEMO: pnl derivado do market_snapshot. LIVE (Fase 4): envia a ordem MARKET
// oposta na Binance e usa o preço médio de execução real como saída.

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

    const row = order as OrderRow;
    let exit = data.exitPrice;

    if (row.mode === "LIVE") {
      const { closeBinancePosition, fetchBinancePrice } = await import("./binance.server");
      const fill = await closeBinancePosition({
        symbol: row.symbol,
        side: row.side,
        quantity: Number(row.quantity),
      });
      exit = fill.avgPrice > 0 ? fill.avgPrice : ((await fetchBinancePrice(row.symbol)) ?? exit);
    }

    if (exit == null) {
      const { data: snap } = await context.supabase
        .from("market_snapshot")
        .select("price")
        .eq("symbol", row.symbol)
        .maybeSingle();
      exit = snap?.price != null ? Number(snap.price) : Number(row.entry_price);
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

// ---------- getOrdersAnalytics --------------------------------------------
// Custos por ordem (taxa de corretagem estimada) + ROI acumulado, separados
// por modo (DEMO x LIVE) para comparação direta do retorno real vs simulado.
// Taxa padrão Binance spot taker = 0,1% por perna (entrada e saída).

const FEE_RATE = 0.001;

export interface ModeAnalyticsDTO {
  mode: "DEMO" | "LIVE";
  orders: number;
  openOrders: number;
  closedOrders: number;
  wins: number;
  losses: number;
  winRate: number;
  volume: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  /** ROI acumulado (%) = netPnl / capital alocado. */
  roiPct: number;
  avgFeePerOrder: number;
  avgNetPnlPerOrder: number;
}

export interface OrderCostDTO {
  id: string;
  mode: "DEMO" | "LIVE";
  symbol: string;
  side: "BUY" | "SELL";
  status: "OPEN" | "CLOSED" | "CANCELLED";
  notional: number;
  fee: number;
  grossPnl: number | null;
  netPnl: number | null;
  netPnlPct: number | null;
  openedAt: string;
  closedAt: string | null;
}

export interface OrdersAnalyticsDTO {
  feeRate: number;
  demo: ModeAnalyticsDTO;
  live: ModeAnalyticsDTO;
  recent: OrderCostDTO[];
}

function emptyMode(mode: "DEMO" | "LIVE"): ModeAnalyticsDTO {
  return {
    mode,
    orders: 0,
    openOrders: 0,
    closedOrders: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    volume: 0,
    grossPnl: 0,
    fees: 0,
    netPnl: 0,
    roiPct: 0,
    avgFeePerOrder: 0,
    avgNetPnlPerOrder: 0,
  };
}

export const getOrdersAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { limit?: number }) =>
    z.object({ limit: z.number().int().min(1).max(500).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<OrdersAnalyticsDTO> => {
    const { data: rows, error } = await context.supabase
      .from("orders")
      .select("*")
      .eq("user_id", context.userId)
      .order("opened_at", { ascending: false })
      .limit(data.limit ?? 300);
    if (error) throw new Error(error.message);

    const acc = { DEMO: emptyMode("DEMO"), LIVE: emptyMode("LIVE") };
    const recent: OrderCostDTO[] = [];

    for (const raw of (rows ?? []) as OrderRow[]) {
      const mode: "DEMO" | "LIVE" = raw.mode === "LIVE" ? "LIVE" : "DEMO";
      const qty = Number(raw.quantity) || 0;
      const entry = Number(raw.entry_price) || 0;
      const exit = raw.exit_price != null ? Number(raw.exit_price) : null;
      const notional = qty * entry;
      const closed = raw.status === "CLOSED";
      const fee = notional * FEE_RATE + (closed && exit != null ? qty * exit * FEE_RATE : 0);
      const gross = raw.pnl != null ? Number(raw.pnl) : null;
      const net = gross != null ? gross - fee : null;

      const m = acc[mode];
      m.orders += 1;
      m.volume += notional;
      m.fees += fee;
      if (raw.status === "OPEN") m.openOrders += 1;
      if (closed) {
        m.closedOrders += 1;
        m.grossPnl += gross ?? 0;
        m.netPnl += net ?? 0;
        if ((net ?? 0) >= 0) m.wins += 1;
        else m.losses += 1;
      }

      if (recent.length < 50) {
        recent.push({
          id: raw.id,
          mode,
          symbol: raw.symbol,
          side: raw.side,
          status: raw.status,
          notional,
          fee,
          grossPnl: gross,
          netPnl: net,
          netPnlPct: net != null && notional > 0 ? (net / notional) * 100 : null,
          openedAt: raw.opened_at,
          closedAt: raw.closed_at,
        });
      }
    }

    for (const m of [acc.DEMO, acc.LIVE]) {
      m.winRate = m.closedOrders > 0 ? (m.wins / m.closedOrders) * 100 : 0;
      m.roiPct = m.volume > 0 ? (m.netPnl / m.volume) * 100 : 0;
      m.avgFeePerOrder = m.orders > 0 ? m.fees / m.orders : 0;
      m.avgNetPnlPerOrder = m.closedOrders > 0 ? m.netPnl / m.closedOrders : 0;
    }

    return { feeRate: FEE_RATE, demo: acc.DEMO, live: acc.LIVE, recent };
  });
