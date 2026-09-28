import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assertLiveTradingAllowed(userId: string): Promise<void> {
  const [{ data: safety, error: safetyError }, { data: tfa, error: tfaError }] = await Promise.all([
    supabaseAdmin
      .from("trading_safety_state")
      .select("live_trading_enabled,reason")
      .eq("id", true)
      .maybeSingle(),
    supabaseAdmin
      .from("user_two_factor")
      .select("enabled")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (safetyError || !safety?.live_trading_enabled) {
    throw new Error(safety?.reason || "Operações reais estão bloqueadas pelo interruptor global de segurança.");
  }
  if (tfaError || !tfa?.enabled) {
    throw new Error("Ative a autenticação em dois fatores antes de usar o modo REAL.");
  }
}