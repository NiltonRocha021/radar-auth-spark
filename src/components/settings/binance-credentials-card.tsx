import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, KeyRound, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { getLiveTradingStatus, revokeMyBinanceCredentials, saveMyBinanceCredentials } from "@/lib/live-trading.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function BinanceCredentialsCard() {
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getLiveTradingStatus);
  const saveFn = useServerFn(saveMyBinanceCredentials);
  const revokeFn = useServerFn(revokeMyBinanceCredentials);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [environment, setEnvironment] = useState<"testnet" | "production">("testnet");
  const status = useQuery({ queryKey: ["live-trading-status"], queryFn: () => statusFn(), refetchInterval: 15_000 });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["live-trading-status"] });
    await queryClient.invalidateQueries({ queryKey: ["bot-config"] });
  };
  const save = useMutation({
    mutationFn: () => saveFn({ data: { apiKey, apiSecret, environment } }),
    onSuccess: async () => {
      setApiKey(""); setApiSecret("");
      toast.success(status.data?.credentialsConfigured ? "Credenciais rotacionadas e validadas" : "Credenciais validadas e salvas");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: () => revokeFn(),
    onSuccess: async () => { toast.success("Credenciais revogadas; modo alterado para DEMO"); await refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const configured = status.data?.credentialsConfigured === true;

  return (
    <div className="space-y-4 border-t border-border pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium"><KeyRound className="size-4" /> Binance por perfil</h3>
          <p className="mt-1 text-xs text-muted-foreground">As chaves são criptografadas e usadas somente nas ordens deste perfil.</p>
        </div>
        <Badge variant={configured ? "default" : "outline"}>
          {configured ? <><CheckCircle2 className="mr-1 size-3" /> {status.data?.apiKeyMasked}</> : "Não conectada"}
        </Badge>
      </div>
      {status.data?.connectivityError && (
        <p className="flex items-start gap-2 text-xs text-destructive"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" />{status.data.connectivityError}</p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5"><Label htmlFor="binance-key">API Key</Label><Input id="binance-key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={configured ? "Nova chave para rotacionar" : "Chave da Binance"} /></div>
        <div className="space-y-1.5"><Label htmlFor="binance-secret">API Secret</Label><Input id="binance-secret" type="password" autoComplete="new-password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="Segredo da Binance" /></div>
        <div className="space-y-1.5"><Label>Ambiente</Label><Select value={environment} onValueChange={(value) => setEnvironment(value as "testnet" | "production")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="testnet">Testnet</SelectItem><SelectItem value="production">Produção</SelectItem></SelectContent></Select></div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {configured && <Button variant="destructive" onClick={() => revoke.mutate()} disabled={revoke.isPending}><Trash2 />Revogar</Button>}
        <Button onClick={() => save.mutate()} disabled={save.isPending || apiKey.trim().length < 8 || apiSecret.trim().length < 8}>
          {configured ? <RefreshCw /> : <KeyRound />}{save.isPending ? "Validando…" : configured ? "Rotacionar e validar" : "Validar e salvar"}
        </Button>
      </div>
    </div>
  );
}