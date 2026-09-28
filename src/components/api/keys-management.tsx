import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, KeyRound, Plus, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AsyncState, EmptyState } from "@/components/common/async-state";
import { RATE_LIMITS } from "@/lib/api-data";
import { cn } from "@/lib/utils";
import { createApiKey, listApiKeys, revokeApiKey, rotateApiKey, type ApiKeyDTO } from "@/lib/api-keys.functions";
import { toast } from "sonner";

function formatDate(value: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function KeysManagement() {
  const queryClient = useQueryClient();
  const fetchKeys = useServerFn(listApiKeys);
  const issueKey = useServerFn(createApiKey);
  const rotateKey = useServerFn(rotateApiKey);
  const revokeKey = useServerFn(revokeApiKey);
  const [name, setName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: "rotate" | "revoke"; key: ApiKeyDTO } | null>(null);

  const keysQuery = useQuery({ queryKey: ["api-keys"], queryFn: () => fetchKeys() });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["api-keys"] });
  const createMutation = useMutation({
    mutationFn: (keyName: string) => issueKey({ data: { name: keyName } }),
    onSuccess: async (result) => {
      setCreateOpen(false);
      setName("");
      setRevealedSecret(result.secret);
      await refresh();
      toast.success("Chave gerada com segurança.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const actionMutation = useMutation({
    mutationFn: async (pending: { action: "rotate" | "revoke"; key: ApiKeyDTO }) => {
      if (pending.action === "rotate") return rotateKey({ data: { id: pending.key.id } });
      await revokeKey({ data: { id: pending.key.id } });
      return null;
    },
    onSuccess: async (result, pending) => {
      setPendingAction(null);
      if (result) setRevealedSecret(result.secret);
      await refresh();
      toast.success(pending.action === "rotate" ? "Chave rotacionada." : "Chave revogada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function copySecret() {
    if (!revealedSecret) return;
    try {
      await navigator.clipboard.writeText(revealedSecret);
      setCopied(true);
      toast.success("Chave copiada.");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">API keys</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Gere, rotacione e monitore o uso de chaves de API.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} disabled={(keysQuery.data?.filter((key) => key.status === "active").length ?? 0) >= 5}>
          <Plus className="size-4 mr-1.5" /> Nova chave
        </Button>
      </header>

      <AsyncState
        isLoading={keysQuery.isLoading}
        error={keysQuery.error}
        isEmpty={keysQuery.data?.length === 0}
        onRetry={() => void keysQuery.refetch()}
        errorTitle="Não foi possível carregar suas chaves"
        empty={<EmptyState title="Nenhuma chave criada" message="Crie uma chave para acessar a API pública." action={<Button size="sm" className="mt-2" onClick={() => setCreateOpen(true)}><KeyRound className="size-4 mr-1.5" />Criar primeira chave</Button>} />}
      >
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-secondary/30 text-xs text-muted-foreground">
              <tr><th className="px-4 py-3 text-left font-medium">Nome</th><th className="px-4 py-3 text-left font-medium">Chave</th><th className="px-4 py-3 text-left font-medium">Uso hoje</th><th className="px-4 py-3 text-left font-medium">Último uso</th><th className="px-4 py-3 text-left font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Ações</th></tr>
            </thead>
            <tbody>
              {keysQuery.data?.map((key) => (
                <tr key={key.id} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium">{key.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{key.maskedKey}</td>
                  <td className="px-4 py-3 tabular-nums">{key.requestsToday}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(key.lastUsedAt)}</td>
                  <td className="px-4 py-3"><Badge variant={key.status === "active" ? "default" : "secondary"}>{key.status === "active" ? "Ativa" : "Revogada"}</Badge></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" disabled={key.status !== "active"} onClick={() => setPendingAction({ action: "rotate", key })}><RefreshCw className="size-3.5 mr-1.5" />Rotacionar</Button>
                    <Button size="sm" variant="destructive" disabled={key.status !== "active"} onClick={() => setPendingAction({ action: "revoke", key })}><ShieldOff className="size-3.5 mr-1.5" />Revogar</Button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AsyncState>

      <div>
        <h3 className="text-sm font-semibold mb-2">Rate limits</h3>
        <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground bg-secondary/30">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Plan</th>
                <th className="text-left font-medium px-4 py-2.5">Daily quota</th>
                <th className="text-left font-medium px-4 py-2.5">Burst</th>
                <th className="text-left font-medium px-4 py-2.5">Streams</th>
              </tr>
            </thead>
            <tbody>
              {RATE_LIMITS.map((r) => (
                <tr key={r.plan} className={cn("border-t border-border/60", r.plan === "Institutional" && "bg-[#378ADD]/5")}>
                  <td className="px-4 py-3 font-medium">{r.plan}</td>
                  <td className="px-4 py-3 tabular-nums">{r.limit}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.burst}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.streams}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar nova chave</DialogTitle><DialogDescription>Use um nome que identifique onde a chave será usada.</DialogDescription></DialogHeader>
          <div className="space-y-2"><label htmlFor="api-key-name" className="text-sm font-medium">Nome</label><Input id="api-key-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Robô de produção" autoFocus /></div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button disabled={!name.trim() || createMutation.isPending} onClick={() => createMutation.mutate(name.trim())}>{createMutation.isPending ? "Gerando..." : "Gerar chave"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revealedSecret !== null} onOpenChange={(open) => { if (!open) { setRevealedSecret(null); setCopied(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Copie sua chave agora</DialogTitle><DialogDescription>Por segurança, o valor completo será exibido somente desta vez. Guarde-o em um local seguro.</DialogDescription></DialogHeader>
          <div className="flex gap-2"><Input readOnly value={revealedSecret ?? ""} className="font-mono text-xs" aria-label="Nova chave de API" /><Button variant="outline" size="icon" onClick={copySecret} aria-label="Copiar chave">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button></div>
          <DialogFooter><Button onClick={() => { setRevealedSecret(null); setCopied(false); }}>Já guardei a chave</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => { if (!open && !actionMutation.isPending) setPendingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{pendingAction?.action === "rotate" ? "Rotacionar esta chave?" : "Revogar esta chave?"}</AlertDialogTitle><AlertDialogDescription>{pendingAction?.action === "rotate" ? "A chave atual deixará de funcionar imediatamente. Você precisará substituir o valor em todos os serviços conectados." : "Esta ação interrompe imediatamente todo acesso feito com a chave e não pode ser desfeita."}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={actionMutation.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={actionMutation.isPending} className={pendingAction?.action === "revoke" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined} onClick={(event) => { event.preventDefault(); if (pendingAction) actionMutation.mutate(pendingAction); }}>{actionMutation.isPending ? "Processando..." : pendingAction?.action === "rotate" ? "Rotacionar" : "Revogar"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
