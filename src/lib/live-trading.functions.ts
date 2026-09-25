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
