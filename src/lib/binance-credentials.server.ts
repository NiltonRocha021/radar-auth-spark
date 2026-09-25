import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BinanceEnvironment = "testnet" | "production";

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  environment: BinanceEnvironment;
  baseUrl: string;
}

const BASE_URLS: Record<BinanceEnvironment, string> = {
  testnet: "https://testnet.binance.vision",
  production: "https://api.binance.com",
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = process.env["BINANCE_CREDENTIALS_ENCRYPTION_KEY"];
  if (!secret) throw new Error("Cofre de credenciais indisponível.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

async function decrypt(ciphertext: string, iv: string): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await encryptionKey(),
    base64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

export async function storeBinanceCredentials(
  userId: string,
  apiKey: string,
  apiSecret: string,
  environment: BinanceEnvironment,
): Promise<void> {
  const [key, secret] = await Promise.all([encrypt(apiKey), encrypt(apiSecret)]);
  const now = new Date().toISOString();
  const { data: previous } = await supabaseAdmin
    .from("binance_credentials")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  const { error } = await supabaseAdmin.from("binance_credentials").upsert(
    {
      user_id: userId,
      api_key_ciphertext: key.ciphertext,
      api_key_iv: key.iv,
      api_secret_ciphertext: secret.ciphertext,
      api_secret_iv: secret.iv,
      key_suffix: apiKey.slice(-4),
      environment,
      status: "valid",
      last_validated_at: now,
      last_validation_error: null,
      revoked_at: null,
      rotated_at: previous ? now : null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error("Não foi possível guardar as credenciais.");

  await supabaseAdmin
    .from("bot4x_configs")
    .upsert({ user_id: userId, api_key_set: true }, { onConflict: "user_id" });
}

export async function getBinanceCredentials(userId: string): Promise<BinanceCredentials> {
  const { data, error } = await supabaseAdmin
    .from("binance_credentials")
    .select("api_key_ciphertext,api_key_iv,api_secret_ciphertext,api_secret_iv,environment,status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data || data.status !== "valid") {
    throw new Error("Credenciais Binance válidas não foram configuradas para este perfil.");
  }
  const environment: BinanceEnvironment = data.environment === "production" ? "production" : "testnet";
  const [apiKey, apiSecret] = await Promise.all([
    decrypt(data.api_key_ciphertext, data.api_key_iv),
    decrypt(data.api_secret_ciphertext, data.api_secret_iv),
  ]);
  return { apiKey, apiSecret, environment, baseUrl: BASE_URLS[environment] };
}

export async function revokeBinanceCredentials(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("binance_credentials")
    .update({ status: "revoked", revoked_at: now })
    .eq("user_id", userId);
  if (error) throw new Error("Não foi possível revogar as credenciais.");
  await supabaseAdmin
    .from("bot4x_configs")
    .upsert({ user_id: userId, api_key_set: false, execution_mode: "DEMO" }, { onConflict: "user_id" });
}

export async function getBinanceCredentialMetadata(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("binance_credentials")
    .select("key_suffix,environment,status,last_validated_at,last_validation_error,rotated_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar as credenciais.");
  return data;
}