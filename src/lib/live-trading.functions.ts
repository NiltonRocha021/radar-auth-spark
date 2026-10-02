// Fase 4 — Status de prontidão para execução LIVE.
// Server fn de leitura que agrega: 2FA verificado, presença das credenciais
// da Binance isoladas por usuário e conectividade/permissões da API key.
// Nunca retorna a chave/segredo — apenas flags e metadados seguros.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LiveTradingStatusDTO {
  twoFactorEnabled: boolean;
  twoFactorEnabledAt: string | null;
  credentialsConfigured: boolean;
  /** Sufixo mascarado da API key (ex.: "••••3f9a"), só para conferência visual. */
  apiKeyMasked: string | null;
  environment: "testnet" | "production" | "unknown";
  baseUrl: string;
  /** Resultado do ping assinado contra a Binance. */
  connectivity: "ok" | "failed" | "skipped";
  connectivityError: string | null;
  canTrade: boolean | null;
  /** true quando todos os requisitos estão satisfeitos. */
  ready: boolean;
}

export interface ProfileFinancialSnapshotDTO {
  mode: "DEMO" | "LIVE";
  source: "simulated" | "binance";
  walletValue: number;
  availableCapital: number;
  pendingOrderCapital: number;
  lockedCapital: number;
  balances: Array<{ asset: string; free: number; locked: number; valueUsdt: number }>;
  updatedAt: string;
}

export interface BinanceOrderValidationDTO {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quoteAmount: number;
  environment: "testnet" | "production";
  status: "VALIDATED";
  validatedAt: string;
}

export const getLiveTradingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LiveTradingStatusDTO> => {
    const { data: tfa } = await context.supabase
      .from("user_two_factor")
      .select("enabled,enabled_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { getBinanceCredentialMetadata } = await import("./binance-credentials.server");
    const metadata = await getBinanceCredentialMetadata(context.userId);
    const credentialsConfigured = metadata?.status === "valid";
    const environment: LiveTradingStatusDTO["environment"] = metadata?.environment === "production" ? "production" : metadata?.environment === "testnet" ? "testnet" : "unknown";
    const baseUrl = environment === "production" ? "https://api.binance.com" : environment === "testnet" ? "https://testnet.binance.vision" : "—";

    let connectivity: LiveTradingStatusDTO["connectivity"] = "skipped";
    let connectivityError: string | null = null;
    let canTrade: boolean | null = null;

    if (credentialsConfigured) {
      try {
        const [{ fetchBinanceAccount }, { getBinanceCredentials }] = await Promise.all([
          import("./binance.server"), import("./binance-credentials.server"),
        ]);
        const account = await fetchBinanceAccount(await getBinanceCredentials(context.userId));
        connectivity = "ok";
        canTrade = account.canTrade;
      } catch (err) {
        connectivity = "failed";
        connectivityError = err instanceof Error ? err.message : "Erro desconhecido";
      }
    }

    const twoFactorEnabled = Boolean(tfa?.enabled);
    return {
      twoFactorEnabled,
      twoFactorEnabledAt: (tfa?.enabled_at as string | null) ?? null,
      credentialsConfigured,
      apiKeyMasked: metadata ? `••••${metadata.key_suffix}` : null,
      environment,
      baseUrl,
      connectivity,
      connectivityError,
      canTrade,
      ready: twoFactorEnabled && credentialsConfigured && connectivity === "ok" && canTrade !== false,
    };
  });

export const getProfileFinancialSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileFinancialSnapshotDTO> => {
    const { data: config, error: configError } = await context.supabase
      .from("bot4x_configs")
      .select("execution_mode,total_capital,active_capital")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (configError) throw new Error("Não foi possível carregar o capital do perfil.");
    const mode: "DEMO" | "LIVE" = config?.execution_mode === "LIVE" ? "LIVE" : "DEMO";

    if (mode === "LIVE") {
      try {
        const [{ fetchBinanceAccount }, { getBinanceCredentials }] = await Promise.all([
          import("./binance.server"), import("./binance-credentials.server"),
        ]);
        const account = await fetchBinanceAccount(await getBinanceCredentials(context.userId));
        return {
          mode,
          source: "binance",
          walletValue: account.walletValueUsdt,
          availableCapital: account.availableValueUsdt,
          pendingOrderCapital: account.openOrderValueUsdt,
          lockedCapital: account.lockedValueUsdt,
          balances: account.balances,
          updatedAt: new Date().toISOString(),
        };
      } catch {
        throw new Error("Não foi possível consultar os saldos deste perfil na Binance.");
      }
    }

    const { data: openOrders, error: ordersError } = await context.supabase
      .from("orders")
      .select("quantity,entry_price")
      .eq("user_id", context.userId)
      .eq("mode", "DEMO")
      .eq("status", "OPEN");
    if (ordersError) throw new Error("Não foi possível carregar as ordens DEMO.");
    const pending = (openOrders ?? []).reduce(
      (sum, order) => sum + Number(order.quantity ?? 0) * Number(order.entry_price ?? 0),
      0,
    );
    const wallet = Number(config?.total_capital ?? config?.active_capital ?? 0);
    return {
      mode,
      source: "simulated",
      walletValue: wallet,
      availableCapital: Math.max(wallet - pending, 0),
      pendingOrderCapital: pending,
      lockedCapital: pending,
      balances: [],
      updatedAt: new Date().toISOString(),
    };
  });

export const validateMyBinanceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    symbol: z.string().trim().min(5).max(20).regex(/^[A-Z0-9]+$/).default("BTCUSDT"),
    side: z.enum(["BUY", "SELL"]).default("BUY"),
    quoteAmount: z.number().min(5).max(1000),
  }).parse(input))
  .handler(async ({ data, context }): Promise<BinanceOrderValidationDTO> => {
    const { data: config } = await context.supabase
      .from("bot4x_configs")
      .select("execution_mode")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (config?.execution_mode !== "LIVE") throw new Error("Salve o modo REAL antes de validar uma ordem.");

    const [{ validateBinanceOrder }, { getBinanceCredentials }] = await Promise.all([
      import("./binance.server"), import("./binance-credentials.server"),
    ]);
    const credentials = await getBinanceCredentials(context.userId);
    try {
      await validateBinanceOrder(data, credentials);
    } catch {
      throw new Error("A Binance recusou a validação. Confira saldo, permissões e limites do par.");
    }
    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("binance_order_validations")
      .insert({
        user_id: context.userId,
        mode: "LIVE",
        symbol: data.symbol,
        side: data.side,
        order_type: "MARKET_TEST",
        quantity: data.quoteAmount,
        price: null,
        status: "VALIDATED",
        environment: credentials.environment,
        message: "Validação aceita sem execução financeira",
        validated_at: now,
      })
      .select("id,symbol,side,quantity,environment,status,validated_at")
      .single();
    if (error || !row) throw new Error("A validação foi aceita, mas não foi possível registrá-la.");
    return {
      id: row.id,
      symbol: row.symbol,
      side: row.side === "SELL" ? "SELL" : "BUY",
      quoteAmount: Number(row.quantity),
      environment: row.environment === "production" ? "production" : "testnet",
      status: "VALIDATED",
      validatedAt: row.validated_at,
    };
  });

export const listMyBinanceOrderValidations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BinanceOrderValidationDTO[]> => {
    const { data, error } = await context.supabase
      .from("binance_order_validations")
      .select("id,symbol,side,quantity,environment,status,validated_at")
      .eq("user_id", context.userId)
      .order("validated_at", { ascending: false })
      .limit(10);
    if (error) throw new Error("Não foi possível carregar as validações recentes.");
    return (data ?? []).map((row) => ({
      id: row.id,
      symbol: row.symbol,
      side: row.side === "SELL" ? "SELL" : "BUY",
      quoteAmount: Number(row.quantity),
      environment: row.environment === "production" ? "production" : "testnet",
      status: "VALIDATED",
      validatedAt: row.validated_at,
    }));
  });

export const saveMyBinanceCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    apiKey: z.string().trim().min(8).max(256),
    apiSecret: z.string().trim().min(8).max(256),
    environment: z.enum(["testnet", "production"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const credentials = {
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      environment: data.environment,
      baseUrl: data.environment === "production" ? "https://api.binance.com" : "https://testnet.binance.vision",
    } as const;
    const { fetchBinanceAccount } = await import("./binance.server");
    const account = await fetchBinanceAccount(credentials);
    if (!account.canTrade) throw new Error("A chave foi reconhecida, mas não possui permissão para operar.");
    const { storeBinanceCredentials } = await import("./binance-credentials.server");
    await storeBinanceCredentials(context.userId, data.apiKey, data.apiSecret, data.environment);
    return { ok: true, apiKeyMasked: `••••${data.apiKey.slice(-4)}`, environment: data.environment };
  });

export const revokeMyBinanceCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { revokeBinanceCredentials } = await import("./binance-credentials.server");
    await revokeBinanceCredentials(context.userId);
    return { ok: true };
  });
