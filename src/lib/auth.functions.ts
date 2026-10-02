// Server functions da Fase 3 — Auth (2FA, sessão, current user).
// Login/refresh/logout continuam via supabase.auth.* no client (nativo).
// Aqui portamos apenas o que exigia lógica server-side: TOTP e revogação
// global de sessões, que precisam do supabaseAdmin (Auth Admin API).
//
// Contratos espelham o que o AuthController do Nest expunha; nomes de campos
// preservam o formato TOTP padrão (otpauth URI) para o app authenticator ler.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- getCurrentUser -------------------------------------------------

export interface CurrentUserDTO {
  id: string;
  email: string | null;
  fullName: string | null;
  username: string | null;
  planTier: string | null;
  roles: string[];
  twoFactorEnabled: boolean;
}

export const getCurrentUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CurrentUserDTO> => {
    const [{ data: profile }, { data: roles }, { data: tfa }] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("email,full_name,username,plan_tier")
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase
        .from("user_two_factor")
        .select("enabled")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    return {
      id: context.userId,
      email: (profile?.email as string | null) ?? (context.claims.email as string | null) ?? null,
      fullName: (profile?.full_name as string | null) ?? null,
      username: (profile?.username as string | null) ?? null,
      planTier: (profile?.plan_tier as string | null) ?? null,
      roles: (roles ?? []).map((r: { role: string }) => r.role),
      twoFactorEnabled: Boolean(tfa?.enabled),
    };
  });

// ---------- 2FA helpers ----------------------------------------------------

const ISSUER = "AISignalRadar";

function generateBackupCodes(): string[] {
  // 10 códigos alfanuméricos de 10 chars (XXXX-XXXX). Uso único.
  const codes: string[] = [];
  const bytes = new Uint8Array(10 * 5);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 10; i++) {
    let s = "";
    for (let j = 0; j < 5; j++) {
      s += bytes[i * 5 + j].toString(36).padStart(2, "0").slice(-2).toUpperCase();
    }
    codes.push(`${s.slice(0, 5)}-${s.slice(5, 10)}`);
  }
  return codes;
}

// ---------- setupTwoFactor -------------------------------------------------

export interface SetupTwoFactorDTO {
  secret: string;
  otpauthUri: string;
  backupCodes: string[];
}

export const setupTwoFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SetupTwoFactorDTO> => {
    const { TOTP, Secret } = await import("otpauth");
    const secret = new Secret({ size: 20 });
    const emailClaim = (context.claims.email as string | null) ?? context.userId;
    const totp = new TOTP({
      issuer: ISSUER,
      label: emailClaim,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });
    const otpauthUri = totp.toString();
    const backupCodes = generateBackupCodes();

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("user_two_factor")
      .select("enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existingError) throw new Error("Falha ao verificar o estado do 2FA: " + existingError.message);
    if (existing?.enabled) throw new Error("Desative o 2FA atual com um código válido antes de configurar um novo segredo.");

    // Upsert em estado "pendente" (enabled=false). Só vira true após verify.
    const { error } = await supabaseAdmin.from("user_two_factor").upsert(
      {
        user_id: context.userId,
        secret: secret.base32,
        backup_codes: backupCodes,
        enabled: false,
        enabled_at: null,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error("Falha ao gravar 2FA: " + error.message);

    return { secret: secret.base32, otpauthUri, backupCodes };
  });

// ---------- verifyTwoFactor ------------------------------------------------

export const verifyTwoFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().trim().regex(/^\d{6}$/, "Código deve ter 6 dígitos") }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: row, error } = await supabaseAdmin
      .from("user_two_factor")
      .select("secret,enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !row) throw new Error("2FA não iniciado. Rode setup antes.");

    const { TOTP, Secret } = await import("otpauth");
    const totp = new TOTP({
      issuer: ISSUER,
      label: (context.claims.email as string | null) ?? context.userId,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(row.secret as string),
    });
    // window=1 → aceita o slot anterior/próximo (relógios ligeiramente fora).
    const delta = totp.validate({ token: data.token, window: 1 });
    if (delta === null) throw new Error("Código inválido");

    const { error: upErr } = await supabaseAdmin
      .from("user_two_factor")
      .update({ enabled: true, enabled_at: new Date().toISOString(), last_used_at: new Date().toISOString() })
      .eq("user_id", context.userId);
    if (upErr) throw new Error("Falha ao ativar 2FA: " + upErr.message);
    return { ok: true };
  });

// ---------- disableTwoFactor ----------------------------------------------

export const disableTwoFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().trim().min(6).max(11) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: row, error } = await supabaseAdmin
      .from("user_two_factor")
      .select("secret,backup_codes,enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !row?.enabled) throw new Error("2FA não está ativo");

    let valid = false;
    if (/^\d{6}$/.test(data.token)) {
      const { TOTP, Secret } = await import("otpauth");
      const totp = new TOTP({
        issuer: ISSUER,
        label: (context.claims.email as string | null) ?? context.userId,
        secret: Secret.fromBase32(row.secret as string),
      });
      valid = totp.validate({ token: data.token, window: 1 }) !== null;
    } else {
      const codes = (row.backup_codes as string[] | null) ?? [];
      valid = codes.includes(data.token);
    }
    if (!valid) throw new Error("Código inválido");

    const { error: delErr } = await supabaseAdmin
      .from("user_two_factor")
      .delete()
      .eq("user_id", context.userId);
    if (delErr) throw new Error("Falha ao desativar 2FA: " + delErr.message);
    return { ok: true };
  });

// ---------- revokeAllSessions ---------------------------------------------

export const revokeAllSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    // Precisa da Auth Admin API — só service_role tem permissão.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.signOut(context.userId, "global");
    if (error) throw new Error("Falha ao revogar sessões: " + error.message);
    return { ok: true };
  });
