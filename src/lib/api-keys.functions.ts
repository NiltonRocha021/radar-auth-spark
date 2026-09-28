import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ApiKeyDTO {
  id: string;
  name: string;
  maskedKey: string;
  status: "active" | "revoked";
  requestsToday: number;
  lastUsedAt: string | null;
  createdAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
}

export interface IssuedApiKeyDTO {
  apiKey: ApiKeyDTO;
  secret: string;
}

const keyIdSchema = z.object({ id: z.string().uuid() });
const keyNameSchema = z.object({ name: z.string().trim().min(1, "Informe um nome").max(60) });

function toDTO(row: {
  id: string;
  name: string;
  key_prefix: string;
  key_suffix: string;
  status: string;
  requests_today: number;
  usage_date: string;
  last_used_at: string | null;
  created_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
}): ApiKeyDTO {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: row.id,
    name: row.name,
    maskedKey: `${row.key_prefix}••••••••${row.key_suffix}`,
    status: row.status === "active" ? "active" : "revoked",
    requestsToday: row.usage_date === today ? row.requests_today : 0,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at,
    revokedAt: row.revoked_at,
  };
}

async function createSecret(): Promise<{ secret: string; hash: string; prefix: string; suffix: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const secret = `asr_live_${token}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { secret, hash, prefix: secret.slice(0, 17), suffix: secret.slice(-4) };
}

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApiKeyDTO[]> => {
    const { data, error } = await context.supabase
      .from("api_keys")
      .select("id,name,key_prefix,key_suffix,status,requests_today,usage_date,last_used_at,created_at,rotated_at,revoked_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar as chaves.");
    return (data ?? []).map(toDTO);
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) => keyNameSchema.parse(input))
  .handler(async ({ data, context }): Promise<IssuedApiKeyDTO> => {
    const { count, error: countError } = await context.supabase
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    if (countError) throw new Error("Não foi possível verificar o limite de chaves.");
    if ((count ?? 0) >= 5) throw new Error("Você pode manter até 5 chaves ativas.");

    const generated = await createSecret();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("api_keys")
      .insert({
        user_id: context.userId,
        name: data.name,
        key_prefix: generated.prefix,
        key_suffix: generated.suffix,
        key_hash: generated.hash,
      })
      .select("id,name,key_prefix,key_suffix,status,requests_today,usage_date,last_used_at,created_at,rotated_at,revoked_at")
      .single();
    if (error || !row) throw new Error("Não foi possível gerar a chave.");
    return { apiKey: toDTO(row), secret: generated.secret };
  });

export const rotateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => keyIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<IssuedApiKeyDTO> => {
    const generated = await createSecret();
    const now = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("api_keys")
      .update({
        key_hash: generated.hash,
        key_prefix: generated.prefix,
        key_suffix: generated.suffix,
        status: "active",
        requests_today: 0,
        usage_date: now.slice(0, 10),
        last_used_at: null,
        rotated_at: now,
        revoked_at: null,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id,name,key_prefix,key_suffix,status,requests_today,usage_date,last_used_at,created_at,rotated_at,revoked_at")
      .maybeSingle();
    if (error || !row) throw new Error("Chave não encontrada ou sem permissão.");
    return { apiKey: toDTO(row), secret: generated.secret };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => keyIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const now = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("api_keys")
      .update({ status: "revoked", revoked_at: now })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("Chave não encontrada, já revogada ou sem permissão.");
    return { ok: true };
  });