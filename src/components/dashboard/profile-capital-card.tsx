import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, FlaskConical, RefreshCw, WalletCards } from "lucide-react";
import {
  getProfileFinancialSnapshot,
  listMyBinanceOrderValidations,
  validateMyBinanceOrder,
} from "@/lib/live-trading.functions";
import { AsyncState } from "@/components/common/async-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function ProfileCapitalCard() {
  const snapshotFn = useServerFn(getProfileFinancialSnapshot);
  const validateFn = useServerFn(validateMyBinanceOrder);
  const validationsFn = useServerFn(listMyBinanceOrderValidations);
  const queryClient = useQueryClient();
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quoteAmount, setQuoteAmount] = useState(10);
  const snapshot = useQuery({ queryKey: ["profile-capital"], queryFn: () => snapshotFn(), refetchInterval: 5_000 });
  const validations = useQuery({ queryKey: ["binance-order-validations"], queryFn: () => validationsFn(), refetchInterval: 15_000 });
  const validation = useMutation({
    mutationFn: () => validateFn({ data: { symbol, side, quoteAmount } }),
    onSuccess: async () => {
      toast.success("Ordem de teste validada sem movimentar fundos");
      await queryClient.invalidateQueries({ queryKey: ["binance-order-validations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const data = snapshot.data;

  return (
    <Card data-tour="profile-capital">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><WalletCards className="size-4" /> Capital do perfil</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Valores do modo salvo, atualizados automaticamente.</p>
        </div>
        {data ? <Badge variant={data.mode === "LIVE" ? "default" : "secondary"}>{data.mode === "LIVE" ? "REAL · Binance" : "DEMO"}</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-5">
        <AsyncState isLoading={snapshot.isLoading} error={snapshot.error} onRetry={() => snapshot.refetch()}>
          {data ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric label="Volume em carteira" value={money(data.walletValue)} />
                <Metric label="Capital disponível" value={money(data.availableCapital)} />
                <Metric label="Em ordens pendentes" value={money(data.pendingOrderCapital)} />
                <Metric label="Capital bloqueado" value={money(data.lockedCapital)} />
              </div>
              {data.mode === "LIVE" && data.balances.length > 0 ? (
                <div className="flex flex-wrap gap-2" aria-label="Principais ativos da carteira">
                  {data.balances.slice(0, 6).map((balance) => (
                    <Badge key={balance.asset} variant="outline" className="font-normal tabular-nums">
                      {balance.asset} · {money(balance.valueUsdt)}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">Atualizado às {new Date(data.updatedAt).toLocaleTimeString("pt-BR")}. {data.source === "binance" ? "As credenciais permaneceram somente no servidor." : "Valores simulados deste perfil."}</p>
            </>
          ) : null}
        </AsyncState>

        <div className="border-t border-border pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-32 flex-1 space-y-1.5"><Label htmlFor="test-symbol">Par</Label><Input id="test-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))} /></div>
            <div className="w-28 space-y-1.5"><Label>Lado</Label><Select value={side} onValueChange={(value) => setSide(value as "BUY" | "SELL")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="BUY">Compra</SelectItem><SelectItem value="SELL">Venda</SelectItem></SelectContent></Select></div>
            <div className="w-36 space-y-1.5"><Label htmlFor="test-amount">Valor em USDT</Label><Input id="test-amount" type="number" min={5} max={1000} value={quoteAmount} onChange={(event) => setQuoteAmount(Number(event.target.value))} /></div>
            <Button variant="outline" disabled={data?.mode !== "LIVE" || validation.isPending || symbol.length < 5 || quoteAmount < 5} onClick={() => validation.mutate()}>
              {validation.isPending ? <RefreshCw className="animate-spin" /> : <FlaskConical />} Validar ordem
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">A validação confere assinatura, permissão e limites na Binance, mas não cria ordem nem movimenta fundos.</p>
          {validations.data?.[0] ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-success">
              <CheckCircle2 className="size-4" /> Última validação: {validations.data[0].symbol} · {validations.data[0].side === "BUY" ? "compra" : "venda"} · {money(validations.data[0].quoteAmount)} · {new Date(validations.data[0].validatedAt).toLocaleString("pt-BR")}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate text-lg font-semibold tabular-nums">{value}</p></div>;
}