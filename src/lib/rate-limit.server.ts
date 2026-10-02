// Server-side rate limiting for privileged mutations.
// The RPC is intentionally called with service_role because it is keyed by the
// authenticated user id supplied by the trusted server function, not auth.uid().
export async function enforceRateLimit(
  userId: string,
  action: string,
  max: number,
  windowSeconds = 60,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("check_rate_limit_by_key", {
    p_key: `user:${userId}`,
    p_action: action,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error("Não foi possível validar o limite de requisições.");
  if (data !== true) throw new Error("Muitas tentativas. Aguarde um instante e tente novamente.");
}
