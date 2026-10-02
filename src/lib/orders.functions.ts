// Ordens DEMO/LIVE com modo decidido exclusivamente pela configuração persistida
// do usuário. O cliente não pode promover uma ordem para LIVE pelo payload.
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
// Guardas para LIVE: modo persistido + credenciais Binance válidas do usuário.

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
        liveConfirmation: z.literal("CONFIRMAR ORDEM REAL").optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<OrderDTO> => {
    let entryPrice = data.entryPrice;
    let quantity = data.quantity;

    const { data: config, error: configError } = await context.supabase
      .from("bot4x_configs")
      .select("execution_mode")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (configError) throw new Error("Não foi possível confirmar o modo de execução.");
    const executionMode: "DEMO" | "LIVE" = config?.execution_mode === "LIVE" ? "LIVE" : "DEMO";

    if (executionMode === "LIVE") {
      if (data.liveConfirmation !== "CONFIRMAR ORDEM REAL") {
        throw new Error("Confirme explicitamente a ordem REAL antes do envio à Binance.");
      }
      if (data.side === "BUY" && data.stopLoss != null && data.stopLoss >= data.entryPrice) {
        throw new Error("Em uma compra, o stop deve ficar abaixo do preço de entrada.");
      }
      if (data.side === "BUY" && data.takeProfit != null && data.takeProfit <= data.entryPrice) {
        throw new Error("Em uma compra, o alvo deve ficar acima do preço de entrada.");
      }
      if (data.side === "SELL" && data.stopLoss != null && data.stopLoss <= data.entryPrice) {
        throw new Error("Em uma venda, o stop deve ficar acima do preço de entrada.");
      }
      if (data.side === "SELL" && data.takeProfit != null && data.takeProfit >= data.entryPrice) {
        throw new Error("Em uma venda, o alvo deve ficar abaixo do preço de entrada.");
      }
      const [{ placeBinanceOrder, fetchBinanceAccount }, { getBinanceCredentials }, { assertTradingRiskAllowed }] = await Promise.all([
        import("./binance.server"), import("./binance-credentials.server"), import("./risk.functions"),
      ]);
      const credentials = await getBinanceCredentials(context.userId);
      // Capital de risco vem da conta Binance no servidor, não de bot4x_configs.
      const account = await fetchBinanceAccount(credentials);
      if (!account.canTrade) {
        throw new Error("A conta Binance não está autorizada para negociação.");
      }
      await assertTradingRiskAllowed(context.supabase, context.userId, {
        walletValueUsdt: account.walletValueUsdt,
      });

      const fill = await placeBinanceOrder({
        symbol: data.symbol,
        side: data.side,
        orderType: data.orderType,
        quantity: data.quantity,
        price: data.orderType === "LIMIT" ? data.entryPrice : undefined,
      }, credentials);
      if (fill.avgPrice > 0) entryPrice = fill.avgPrice;
      if (fill.executedQty > 0) quantity = fill.executedQty;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: context.userId,
        mode: executionMode,
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

/** Alias público do pipeline único; o modo é sempre resolvido no servidor. */
export const placeOrder = placeDemoOrder;

// ---------- closeOrder (DEMO | LIVE) ---------------------------------------
// DEMO: pnl derivado do market_snapshot. LIVE (Fase 4): envia a ordem MARKET
// oposta na Binance e usa o preço médio de execução real como saída.

export const closeDemoOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; exitPrice?: number; liveConfirmation?: "CONFIRMAR ORDEM REAL" }) =>
    z
      .object({
        orderId: z.string().uuid(),
        exitPrice: z.number().positive().optional(),
        liveConfirmation: z.literal("CONFIRMAR ORDEM REAL").optional(),
      })
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
      if (data.liveConfirmation !== "CONFIRMAR ORDEM REAL") {
        throw new Error("Confirme explicitamente o encerramento REAL antes do envio à Binance.");
      }
      const [{ closeBinancePosition, fetchBinancePrice }, { getBinanceCredentials }] = await Promise.all([
        import("./binance.server"), import("./binance-credentials.server"),
      ]);
      const credentials = await getBinanceCredentials(context.userId);
      const fill = await closeBinancePosition({
        symbol: row.symbol,
        side: row.side,
        quantity: Number(row.quantity),
      }, credentials);
      exit = fill.avgPrice > 0 ? fill.avgPrice : ((await fetchBinancePrice(row.symbol, credentials.baseUrl)) ?? exit);
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: uErr } = await supabaseAdmin
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
  /** Retorno sobre volume operado (%) = netPnl / volume. Não representa ROI sobre capital. */
  roiPct: number;
  avgFeePerOrder: number;
  avgNetPnlPerOrder: number;
  /** Exposição em aberto (notional das ordens abertas). */
  openExposure: number;
  /** Saldo atual = PnL líquido realizado acumulado a partir dos trades reais. */
  balance: number;
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
    openExposure: 0,
    balance: 0,
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
      if (raw.status === "OPEN") {
        m.openOrders += 1;
        m.openExposure += notional;
      }
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
      m.balance = m.netPnl;
    }

    return { feeRate: FEE_RATE, demo: acc.DEMO, live: acc.LIVE, recent };
  });

// ---------- getPairAnalytics ----------------------------------------------
// Desempenho por par (símbolo): ordens, taxa de sucesso, custos, PnL líquido e
// curva de patrimônio acumulada, para a tela de "Trades por par" ligada ao
// polling do bot LIVE.

export interface PairStatsDTO {
  symbol: string;
  orders: number;
  openOrders: number;
  closedOrders: number;
  wins: number;
  losses: number;
  winRate: number;
  volume: number;
  fees: number;
  grossPnl: number;
  netPnl: number;
  roiPct: number;
  lastOrderAt: string;
}

export interface EquityPointDTO {
  t: string;
  /** PnL líquido acumulado até esta ordem encerrada. */
  cum: number;
  /** PnL líquido da ordem. */
  pnl: number;
  symbol: string;
}

export interface PairAnalyticsDTO {
  feeRate: number;
  mode: "DEMO" | "LIVE" | "ALL";
  pairs: PairStatsDTO[];
  /** Curva por par (ordem cronológica) — apenas ordens encerradas. */
  equityBySymbol: Record<string, EquityPointDTO[]>;
  /** PnL líquido realizado em ordem cronológica; ordens abertas/canceladas não entram na curva. */
  equityCurve: EquityPointDTO[];
  totals: {
    orders: number;
    closedOrders: number;
    winRate: number;
    netPnl: number;
    fees: number;
    /** Volume operado (notional de entrada acumulado). */
    volume: number;
    /** Retorno sobre volume operado (%) = netPnl / volume. Não representa ROI sobre capital. */
    roiPct: number;
    /** PnL líquido realizado acumulado. */
    balance: number;
  };
}

export const getPairAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { mode?: "DEMO" | "LIVE"; limit?: number }) =>
    z
      .object({ mode: z.enum(MODES).optional(), limit: z.number().int().min(1).max(1000).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<PairAnalyticsDTO> => {
    let q = context.supabase
      .from("orders")
      .select("*")
      .eq("user_id", context.userId)
      .order("opened_at", { ascending: true })
      .limit(data.limit ?? 500);
    if (data.mode) q = q.eq("mode", data.mode);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const stats = new Map<string, PairStatsDTO>();
    const equity: Record<string, EquityPointDTO[]> = {};
    const cum = new Map<string, number>();
    const equityCurve: EquityPointDTO[] = [];
    let totalRunning = 0;

    for (const raw of (rows ?? []) as OrderRow[]) {
      const symbol = raw.symbol;
      let s = stats.get(symbol);
      if (!s) {
        s = {
          symbol,
          orders: 0,
          openOrders: 0,
          closedOrders: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          volume: 0,
          fees: 0,
          grossPnl: 0,
          netPnl: 0,
          roiPct: 0,
          lastOrderAt: raw.opened_at,
        };
        stats.set(symbol, s);
        equity[symbol] = [];
      }

      const qty = Number(raw.quantity) || 0;
      const entry = Number(raw.entry_price) || 0;
      const exit = raw.exit_price != null ? Number(raw.exit_price) : null;
      const notional = qty * entry;
      const closed = raw.status === "CLOSED";
      const fee = notional * FEE_RATE + (closed && exit != null ? qty * exit * FEE_RATE : 0);
      const gross = raw.pnl != null ? Number(raw.pnl) : 0;
      const net = closed ? gross - fee : 0;
      s.orders += 1;
      s.volume += notional;
      s.fees += fee;
      if (raw.opened_at > s.lastOrderAt) s.lastOrderAt = raw.opened_at;
      if (raw.status === "OPEN") s.openOrders += 1;
      if (closed) {
        s.closedOrders += 1;
        s.grossPnl += gross;
        s.netPnl += net;
        if (net >= 0) s.wins += 1;
        else s.losses += 1;
        const running = (cum.get(symbol) ?? 0) + net;
        cum.set(symbol, running);
        equity[symbol]!.push({
          t: raw.closed_at ?? raw.opened_at,
          cum: running,
          pnl: net,
          symbol,
        });
      }

      if (closed) {
        totalRunning += net;
        equityCurve.push({
          t: raw.closed_at ?? raw.opened_at,
          cum: totalRunning,
          pnl: net,
          symbol,
        });
      }
    }

    const pairs = Array.from(stats.values()).map((s) => ({
      ...s,
      winRate: s.closedOrders > 0 ? (s.wins / s.closedOrders) * 100 : 0,
      roiPct: s.volume > 0 ? (s.netPnl / s.volume) * 100 : 0,
    }));
    pairs.sort((a, b) => b.orders - a.orders);

    const totals = pairs.reduce(
      (t, p) => ({
        orders: t.orders + p.orders,
        closedOrders: t.closedOrders + p.closedOrders,
        wins: t.wins + p.wins,
        netPnl: t.netPnl + p.netPnl,
        fees: t.fees + p.fees,
        volume: t.volume + p.volume,
      }),
      { orders: 0, closedOrders: 0, wins: 0, netPnl: 0, fees: 0, volume: 0 },
    );

    return {
      feeRate: FEE_RATE,
      mode: data.mode ?? "ALL",
      pairs,
      equityBySymbol: equity,
      equityCurve,
      totals: {
        orders: totals.orders,
        closedOrders: totals.closedOrders,
        winRate: totals.closedOrders > 0 ? (totals.wins / totals.closedOrders) * 100 : 0,
        netPnl: totals.netPnl,
        fees: totals.fees,
        volume: totals.volume,
        roiPct: totals.volume > 0 ? (totals.netPnl / totals.volume) * 100 : 0,
        balance: totals.netPnl,
      },
    };
  });

// ---------- getRiskByPair --------------------------------------------------
// Risco por par a partir das ordens abertas: posição, margem alocada (notional),
// perda máxima até o stop e participação no capital exposto. Também avalia o
// saldo realizado para disparar alerta quando entra em zona de perda.

export interface PairRiskDTO {
  symbol: string;
  openOrders: number;
  quantity: number;
  avgEntry: number;
  /** Margem alocada = notional das posições abertas. */
  margin: number;
  /** Perda máxima estimada até o stop (positivo = perda). */
  riskAmount: number;
  /** Risco em % do capital exposto total. */
  riskPct: number;
  /** Participação da margem no total exposto (%). */
  exposurePct: number;
  hasStop: boolean;
}

export interface RiskByPairDTO {
  mode: "DEMO" | "LIVE";
  /** Saldo realizado (PnL líquido acumulado). */
  balance: number;
  /** Pico do saldo realizado. */
  peakBalance: number;
  /** Queda do pico (positivo = perda desde o topo). */
  drawdown: number;
  drawdownPct: number;
  totalMargin: number;
  totalRisk: number;
  /** Risco total em % da margem alocada. */
  totalRiskPct: number;
  alertLevel: "none" | "warning" | "danger";
  alerts: string[];
  pairs: PairRiskDTO[];
}

export const getRiskByPair = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { mode?: "DEMO" | "LIVE" }) =>
    z.object({ mode: z.enum(MODES).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<RiskByPairDTO> => {
    let mode = data.mode;
    if (!mode) {
      const { data: config } = await context.supabase
        .from("bot4x_configs")
        .select("execution_mode")
        .eq("user_id", context.userId)
        .maybeSingle();
      mode = config?.execution_mode === "LIVE" ? "LIVE" : "DEMO";
    }
    const { data: rows, error } = await context.supabase
      .from("orders")
      .select("*")
      .eq("user_id", context.userId)
      .eq("mode", mode)
      .order("opened_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    const acc = new Map<string, PairRiskDTO & { notionalSum: number }>();
    let balance = 0;
    let peak = 0;

    for (const raw of (rows ?? []) as OrderRow[]) {
      const qty = Number(raw.quantity) || 0;
      const entry = Number(raw.entry_price) || 0;
      const exit = raw.exit_price != null ? Number(raw.exit_price) : null;
      const notional = qty * entry;

      if (raw.status === "CLOSED") {
        const fee = notional * FEE_RATE + (exit != null ? qty * exit * FEE_RATE : 0);
        balance += (raw.pnl != null ? Number(raw.pnl) : 0) - fee;
        if (balance > peak) peak = balance;
        continue;
      }
      if (raw.status !== "OPEN") continue;

      let p = acc.get(raw.symbol);
      if (!p) {
        p = {
          symbol: raw.symbol,
          openOrders: 0,
          quantity: 0,
          avgEntry: 0,
          margin: 0,
          riskAmount: 0,
          riskPct: 0,
          exposurePct: 0,
          hasStop: true,
          notionalSum: 0,
        };
        acc.set(raw.symbol, p);
      }
      p.openOrders += 1;
      p.quantity += qty;
      p.margin += notional;
      p.notionalSum += notional;

      const stop = raw.stop_loss != null ? Number(raw.stop_loss) : null;
      if (stop != null && stop > 0) {
        const perUnit = raw.side === "BUY" ? entry - stop : stop - entry;
        p.riskAmount += Math.max(perUnit, 0) * qty;
      } else {
        p.hasStop = false;
        // Sem stop definido: assume risco de 100% da margem alocada.
        p.riskAmount += notional;
      }
    }

    const pairs = Array.from(acc.values()).map((p) => ({
      symbol: p.symbol,
      openOrders: p.openOrders,
      quantity: p.quantity,
      avgEntry: p.quantity > 0 ? p.notionalSum / p.quantity : 0,
      margin: p.margin,
      riskAmount: p.riskAmount,
      riskPct: p.margin > 0 ? (p.riskAmount / p.margin) * 100 : 0,
      exposurePct: 0,
      hasStop: p.hasStop,
    }));

    const totalMargin = pairs.reduce((t, p) => t + p.margin, 0);
    const totalRisk = pairs.reduce((t, p) => t + p.riskAmount, 0);
    for (const p of pairs) p.exposurePct = totalMargin > 0 ? (p.margin / totalMargin) * 100 : 0;
    pairs.sort((a, b) => b.riskAmount - a.riskAmount);

    const drawdown = Math.max(peak - balance, 0);
    const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;

    const alerts: string[] = [];
    let level: RiskByPairDTO["alertLevel"] = "none";
    if (balance < 0) {
      level = "danger";
      alerts.push(`Saldo real em zona de perda: ${balance.toFixed(2)} USD acumulados.`);
    }
    if (peak > 0 && drawdownPct >= 20) {
      level = "danger";
      alerts.push(`Queda de ${drawdownPct.toFixed(1)}% desde o melhor saldo.`);
    } else if (peak > 0 && drawdownPct >= 10) {
      if (level !== "danger") level = "warning";
      alerts.push(`Queda de ${drawdownPct.toFixed(1)}% desde o melhor saldo.`);
    }
    const noStop = pairs.filter((p) => !p.hasStop);
    if (noStop.length > 0) {
      if (level !== "danger") level = "warning";
      alerts.push(`Posições sem stop definido: ${noStop.map((p) => p.symbol).join(", ")}.`);
    }
    if (totalMargin > 0 && totalRisk / totalMargin >= 0.5) {
      if (level !== "danger") level = "warning";
      alerts.push("Risco até o stop acima de 50% da margem alocada.");
    }

    return {
      mode,
      balance,
      peakBalance: peak,
      drawdown,
      drawdownPct,
      totalMargin,
      totalRisk,
      totalRiskPct: totalMargin > 0 ? (totalRisk / totalMargin) * 100 : 0,
      alertLevel: level,
      alerts,
      pairs,
    };
  });
