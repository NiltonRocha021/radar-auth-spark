import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, Eye, EyeOff, Check, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — AISignalRadar" },
      { name: "description", content: "Choose a new password for your AISignalRadar account." },
    ],
  }),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: z
      .string()
      .min(12, "Mínimo de 12 caracteres")
      .regex(/[A-Z]/, "Inclua ao menos uma letra maiúscula")
      .regex(/[a-z]/, "Inclua ao menos uma letra minúscula")
      .regex(/\d/, "Inclua ao menos um número")
      .regex(/[^A-Za-z0-9]/, "Inclua ao menos um caractere especial"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem",
  });

type Status = "checking" | "ready" | "invalid" | "success";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const resolveReady = () => {
      if (resolved) return;
      resolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      setStatus("ready");
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        resolveReady();
      }
    });

    // Supabase pode processar o token antes do listener ser registrado.
    // Por isso verificamos a sessão imediatamente e fazemos uma segunda
    // verificação curta para cobrir a hidratação assíncrona do SDK.
    supabase.auth.getSession().then(({ data, error }) => {
      if (resolved) return;

      if (error) {
        resolved = true;
        setStatus("invalid");
        setErrorMsg(friendlyResetError(error.message));
        return;
      }

      if (data.session) {
        resolveReady();
        return;
      }

      timeoutId = setTimeout(async () => {
        if (resolved) return;
        const { data: again, error: retryError } = await supabase.auth.getSession();
        if (again.session) {
          resolveReady();
        } else {
          resolved = true;
          setStatus("invalid");
          setErrorMsg(
            retryError
              ? friendlyResetError(retryError.message)
              : "Link de recuperação inválido ou expirado. Solicite um novo email.",
          );
        }
      }, 1500);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const friendlyResetError = (message?: string | null) => {
    const normalized = (message ?? "").toLowerCase();
    if (normalized.includes("expired") || normalized.includes("invalid"))
      return "Link de recuperação inválido ou expirado. Solicite um novo email.";
    if (normalized.includes("network") || normalized.includes("fetch"))
      return "Não foi possível validar o link. Verifique sua conexão e tente novamente.";
    return "Não foi possível validar o link de recuperação. Solicite um novo email.";
  };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: z.infer<typeof schema>) => {
    setErrorMsg(null);
    const { error } = await supabase.auth.updateUser({ password: v.password });
    if (error) {
      setErrorMsg(friendlyResetError(error.message));
      return;
    }
    setStatus("success");
    setTimeout(() => {
      supabase.auth.signOut().finally(() => navigate({ to: "/login" }));
    }, 2000);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background bg-dot-grid px-4 py-10 relative overflow-hidden">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div
          className="rounded-full border border-[var(--brand-cyan)]"
          style={{ width: 420, height: 420, animation: "radar-pulse 6s ease-out infinite" }}
        />
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--brand-cyan)]"
          style={{ width: 420, height: 420, animation: "radar-pulse 6s ease-out infinite", animationDelay: "3s" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[420px] rounded-2xl border border-border bg-card shadow-xl shadow-black/40">
        <div className="p-7">
          <div className="flex items-center gap-3">
            <BrandLogo size={42} />
            <div className="flex flex-col leading-tight">
              <span className="text-[20px] font-medium text-foreground">AISignalRadar</span>
              <span className="text-[12px] text-muted-foreground">Intelligence Platform</span>
            </div>
          </div>
          <div className="my-6 h-px bg-border" />

          {status === "checking" && (
            <div className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              <p className="text-sm">Validando link de recuperação…</p>
            </div>
          )}

          {status === "invalid" && (
            <div className="text-center py-4">
              <div
                className="mx-auto size-14 rounded-full flex items-center justify-center mb-4"
                style={{ background: "color-mix(in oklab, var(--destructive) 20%, transparent)" }}
              >
                <AlertTriangle className="size-7" style={{ color: "var(--destructive)" }} />
              </div>
              <h2 className="text-lg font-medium text-foreground">Link inválido ou expirado</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {errorMsg ?? "Este link de recuperação não é mais válido."}
              </p>
              <Link
                to="/login"
                className="mt-6 inline-block text-sm text-[var(--brand-cyan)] hover:underline"
              >
                Solicitar novo email de reset
              </Link>
            </div>
          )}

          {status === "success" && (
            <div className="text-center py-4">
              <div
                className="mx-auto size-14 rounded-full flex items-center justify-center mb-4"
                style={{ background: "color-mix(in oklab, var(--success) 20%, transparent)" }}
              >
                <Check className="size-7" style={{ color: "var(--success)" }} />
              </div>
              <h2 className="text-lg font-medium text-foreground">Senha alterada com sucesso</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Redirecionando para o login…
              </p>
            </div>
          )}

          {status === "ready" && (
            <div>
              <h2 className="text-lg font-medium text-foreground">Defina sua nova senha</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Use mínimo 12 caracteres, com letra maiúscula, minúscula, número e caractere especial.
              </p>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                <div>
                  <div
                    className={`group flex items-center gap-2 rounded-lg border bg-secondary/50 px-3 h-11 transition-colors focus-within:border-[var(--brand-cyan)] ${
                      errors.password ? "border-destructive" : "border-border"
                    }`}
                  >
                    <Lock className="size-4 text-muted-foreground" />
                    <input
                      type={showPw ? "text" : "password"}
                      placeholder="Nova senha"
                      autoComplete="new-password"
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                      {...register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>

                <div>
                  <div
                    className={`group flex items-center gap-2 rounded-lg border bg-secondary/50 px-3 h-11 transition-colors focus-within:border-[var(--brand-cyan)] ${
                      errors.confirm ? "border-destructive" : "border-border"
                    }`}
                  >
                    <Lock className="size-4 text-muted-foreground" />
                    <input
                      type={showPw ? "text" : "password"}
                      placeholder="Confirmar nova senha"
                      autoComplete="new-password"
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                      {...register("confirm")}
                    />
                  </div>
                  {errors.confirm && (
                    <p className="mt-1 text-xs text-destructive">{errors.confirm.message}</p>
                  )}
                </div>

                {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 rounded-lg text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center"
                  style={{ background: "var(--brand-blue)" }}
                >
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Alterar senha"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
