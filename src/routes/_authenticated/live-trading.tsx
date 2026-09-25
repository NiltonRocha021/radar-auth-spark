import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TopBar } from "@/components/dashboard/top-bar";
import { LeftSidebar } from "@/components/dashboard/left-sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  PlugZap,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { getLiveTradingStatus } from "@/lib/live-trading.functions";
import { setupTwoFactor, verifyTwoFactor } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated/live-trading")({
  head: () => ({
    meta: [
      { title: "Modo LIVE — Pré-voo | AISignalRadar" },
      {
        name: "description",
        content:
          "Confirme 2FA, credenciais da corretora e conectividade antes de ligar o bot em execução real.",
      },
      { property: "og:title", content: "Modo LIVE — Pré-voo | AISignalRadar" },
      {
        property: "og:description",
        content: "Checklist de segurança antes de habilitar execução real do bot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LiveTradingPage,
});

type State = "ok" | "warn" | "fail" | "idle";

function StatusRow({
  icon: Icon,
  title,
  description,
  state,
  action,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  state: State;
  action?: React.ReactNode;
}) {
  const badge =
    state === "ok" ? (
      <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <CheckCircle2 className="size-3 mr-1" /> OK
      </Badge>
    ) : state === "warn" ? (
      <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <AlertTriangle className="size-3 mr-1" /> Atenção
      </Badge>
    ) : state === "fail" ? (
      <Badge className="bg-red-500/15 text-red-400 border border-red-500/30">
        <XCircle className="size-3 mr-1" /> Pendente
      </Badge>
    ) : (
      <Badge variant="secondary">—</Badge>
    );

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card/40 p-4">
      <Icon className="size-5 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{title}</span>
          {badge}
        </div>
        <p className="text-xs text-muted-foreground mt-1 break-words">{description}</p>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

function LiveTradingPage() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getLiveTradingStatus);
  const runSetup = useServerFn(setupTwoFactor);
  const runVerify = useServerFn(verifyTwoFactor);

  const [open, setOpen] = useState(false);
  const [otp, setOtp] = useState("");

  const statusQuery = useQuery({
    queryKey: ["live-trading-status"],
    queryFn: () => fetchStatus(),
    staleTime: 15_000,
  });

  const setupMutation = useMutation({
    mutationFn: () => runSetup(),
    onSuccess: () => {
      setOtp("");
      setOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyMutation = useMutation({
    mutationFn: (token: string) => runVerify({ data: { token } }),
    onSuccess: async () => {
      toast.success("2FA ativado");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["live-trading-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = statusQuery.data;
  const setup = setupMutation.data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <div className="flex">
        <LeftSidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-[900px] mx-auto p-5 space-y-5">
            <header className="space-y-1">
              <h1 className="text-xl font-semibold">Modo LIVE — checklist de pré-voo</h1>
              <p className="text-sm text-muted-foreground">
                O bot só executa ordens reais quando todos os requisitos abaixo estiverem verdes.
                Enquanto isso, as ordens continuam em modo DEMO.
              </p>
            </header>

            {statusQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : statusQuery.isError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                Não foi possível carregar o status:{" "}
                {(statusQuery.error as Error)?.message ?? "erro desconhecido"}
              </div>
            ) : s ? (
              <>
                <div
                  className={`rounded-lg border p-4 flex items-center justify-between gap-3 flex-wrap ${
                    s.ready
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-amber-500/30 bg-amber-500/10"
                  }`}
                >
                  <div className="text-sm">
                    <div className="font-medium">
                      {s.ready ? "Pronto para LIVE" : "Ainda não liberado para LIVE"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Ambiente:{" "}
                      {s.environment === "production"
                        ? "Produção (dinheiro real)"
                        : s.environment === "testnet"
                          ? "Testnet (sem dinheiro real)"
                          : "Desconhecido"}{" "}
                      · {s.baseUrl}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => statusQuery.refetch()}
                    disabled={statusQuery.isFetching}
                  >
                    <RefreshCw
                      className={`size-3.5 mr-1 ${statusQuery.isFetching ? "animate-spin" : ""}`}
                    />
                    Revalidar
                  </Button>
                </div>

                <div className="space-y-3">
                  <StatusRow
                    icon={s.twoFactorEnabled ? ShieldCheck : ShieldAlert}
                    title="Autenticação em dois fatores (2FA)"
                    description={
                      s.twoFactorEnabled
                        ? `Ativo desde ${
                            s.twoFactorEnabledAt
                              ? new Date(s.twoFactorEnabledAt).toLocaleString("pt-BR")
                              : "—"
                          }. Exigido para qualquer ordem em modo LIVE.`
                        : "Obrigatório antes de operar em LIVE. Use um app autenticador (Google Authenticator, 1Password, Authy)."
                    }
                    state={s.twoFactorEnabled ? "ok" : "fail"}
                    action={
                      s.twoFactorEnabled ? null : (
                        <Button
                          size="sm"
                          onClick={() => setupMutation.mutate()}
                          disabled={setupMutation.isPending}
                        >
                          {setupMutation.isPending ? "Gerando…" : "Ativar 2FA"}
                        </Button>
                      )
                    }
                  />

                  <StatusRow
                    icon={KeyRound}
                    title="Credenciais da corretora"
                    description={
                       s.credentialsConfigured
                         ? `Chave exclusiva deste perfil (${s.apiKeyMasked}). O segredo nunca é exposto ao navegador.`
                         : "Cadastre e valide as credenciais deste perfil em Configurações › API Keys."
                    }
                    state={s.credentialsConfigured ? "ok" : "fail"}
                  />

                  <StatusRow
                    icon={PlugZap}
                    title="Conectividade e permissões"
                    description={
                      s.connectivity === "ok"
                        ? s.canTrade
                          ? "Conexão assinada validada e a chave tem permissão de trading."
                          : "Conexão validada, mas a chave NÃO tem permissão de trading (canTrade=false)."
                        : s.connectivity === "failed"
                          ? `Falha ao validar a chave: ${s.connectivityError ?? "erro desconhecido"}`
                          : "Aguardando credenciais para testar a conexão."
                    }
                    state={
                      s.connectivity === "ok"
                        ? s.canTrade
                          ? "ok"
                          : "warn"
                        : s.connectivity === "failed"
                          ? "fail"
                          : "idle"
                    }
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Recomendação: valide primeiro na testnet. Só aponte para produção depois de ver
                  ordens executadas corretamente aqui.
                </p>
              </>
            ) : null}
          </div>
        </main>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ativar 2FA</DialogTitle>
          </DialogHeader>
          {setup ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Escaneie o QR no seu app autenticador e digite o código de 6 dígitos.
              </p>
              <div className="flex justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setup.otpauthUri)}`}
                  alt="QR code para configurar 2FA"
                  className="rounded-md bg-white p-2"
                  width={200}
                  height={200}
                />
              </div>
              <div className="text-xs text-center text-muted-foreground font-mono break-all">
                {setup.secret}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Códigos de backup (guarde em local seguro):
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {setup.backupCodes.map((c) => (
                    <div key={c} className="font-mono text-xs bg-secondary rounded px-2 py-1 text-center">
                      {c}
                    </div>
                  ))}
                </div>
              </div>
              <Input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="text-center text-lg tracking-[0.5em] font-mono"
                aria-label="Código de 6 dígitos"
              />
              <DialogFooter>
                <Button
                  onClick={() => verifyMutation.mutate(otp)}
                  disabled={otp.length !== 6 || verifyMutation.isPending}
                >
                  {verifyMutation.isPending ? "Verificando…" : "Verificar e ativar"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
