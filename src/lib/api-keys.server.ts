import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authenticateApiKey(request: Request): Promise<{ userId: string; keyId: string } | null> {
  const authorization = request.headers.get("authorization");
  const secret = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!secret?.startsWith("asr_live_") || secret.length !== 73) return null;

  const hash = await sha256(secret);
  const { data: key, error } = await supabaseAdmin
    .from("api_keys")
    .select("id,user_id,requests_today,usage_date")
    .eq("key_hash", hash)
    .eq("status", "active")
    .maybeSingle();
  if (error || !key) return null;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nextCount = key.usage_date === today ? key.requests_today + 1 : 1;
  await supabaseAdmin
    .from("api_keys")
    .update({ requests_today: nextCount, usage_date: today, last_used_at: now.toISOString() })
    .eq("id", key.id);
  return { userId: key.user_id, keyId: key.id };
}