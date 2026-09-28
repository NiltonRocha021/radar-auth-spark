// Fase 4 — Status de prontidão para execução LIVE.
// Server fn de leitura que agrega: 2FA verificado, presença das credenciais
// da Binance no ambiente do Worker e conectividade/permissões da API key.
// Nunca retorna a chave/segredo — apenas flags e metadados seguros.
import { createServerFn } from "@tanstack/react-start";
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

    const apiKey = process.env["BINANCE_API_KEY"];
    const apiSecret = process.env["BINANCE_API_SECRET"];
    const baseUrl = process.env["BINANCE_BASE_URL"] || "https://testnet.binance.vision";
    const credentialsConfigured = Boolean(apiKey && apiSecret);

    const environment: LiveTradingStatusDTO["environment"] = /testnet/i.test(baseUrl)
      ? "testnet"
      : /binance\.(com|us)/i.test(baseUrl)
        ? "production"
        : "unknown";

    let connectivity: LiveTradingStatusDTO["connectivity"] = "skipped";
    let connectivityError: string | null = null;
    let canTrade: boolean | null = null;

    if (credentialsConfigured) {
      try {
        const { fetchBinanceAccount } = await import("./binance.server");
        const account = await fetchBinanceAccount();
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
      apiKeyMasked: apiKey ? `••••${apiKey.slice(-4)}` : null,
      environment,
      baseUrl,
      connectivity,
      connectivityError,
      canTrade,
      ready: twoFactorEnabled && credentialsConfigured && connectivity === "ok" && canTrade !== false,
    };
  });
