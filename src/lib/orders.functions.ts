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

async function requireTwoFactorEnabled(
  supabase: any,
  userId: string,
  claims: unknown,
): Promise<void> {
  const aal = (claims as { aal?: unknown } | null)?.aal;
  if (aal !== "aal2") {
    throw new Error("A autenticação multifator (AAL2) é obrigatória para operações REAL.");
  }

  const { data, error } = await supabase
    .from("user_two_factor")
    .select("enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível verificar o 2FA antes da operação REAL.");
  if (!data?.enabled) throw new Error("Ative o 2FA antes de operar no modo REAL.");
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
      await requireTwoFactorEnabled(context.supabase, context.userId, context.claims);
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
      .eq("user_id", context.userId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) throw new Error("Ordem não encontrada");
    if (order.status !== "OPEN") throw new Error("Ordem já encerrada");

    const row = order as OrderRow;
    let exit = data.exitPrice;

    if (row.mode === "LIVE") {
      await requireTwoFactorEnabled(context.supabase, context.userId, context.claims);
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
        quantity: row.quantity,
      }, credentials);
      exit = fill.avgPrice > 0 ? fill.avgPrice : await fetchBinancePrice(row.symbol, credentials);
    }

    if (exit == null || !Number.isFinite(exit) || exit <= 0) {
      throw new Error("Preço de saída inválido.");
    }

    const pnl = row.side === "BUY"
      ? (exit - row.entry_price) * row.quantity
      : (row.entry_price - exit) * row.quantity;
    const pnlPct = row.entry_price > 0 ? (pnl / (row.entry_price * row.quantity)) * 100 : 0;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: uErr } = await supabaseAdmin
      .from("orders")
      .update({
        exit_price: exit,
        pnl,
        pnl_pct: pnlPct,
        status: "CLOSED",
        closed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (uErr) throw new Error("Falha ao encerrar ordem: " + uErr.message);
    return toDto(updated as OrderRow);
  });

export const closeOrder = closeDemoOrder;
