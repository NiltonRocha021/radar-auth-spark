// Rewire Fase R: consome a server function `getDnaProfile` no lugar do
// endpoint REST do Nest. O `userId` vem sempre de `context.userId` na server
// fn — o parâmetro aqui só serve de gate para `enabled`.
//
// Parsing defensivo: `data` pode vir ausente, como string JSON legada ou
// malformado. `extractDnaMetrics` normaliza tudo e devolve `{}` em vez de
// lançar — quem consome cai no fallback demo.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDnaProfile, type DnaProfileDTO } from "@/lib/dna.functions";
import { extractDnaMetrics } from "@/lib/dna-schema";

export interface DnaProfileUI extends DnaProfileDTO {
  dnaConsistency?: number;
  dnaDiscipline?: number;
  dnaRiskControl?: number;
  dnaTiming?: number;
  dnaEmotionalControl?: number;
}

export function toUI(dto: DnaProfileDTO | null | undefined): DnaProfileUI {
  const base = (dto ?? {}) as DnaProfileDTO;
  // Só emitimos as chaves quando há valor real — o consumidor usa
  // `"dnaConsistency" in data` como sinal de "tenho dado ao vivo".
  return { ...base, ...extractDnaMetrics(base.data) };
}

export function useDnaProfile(userId: string | undefined) {
  const fetchDna = useServerFn(getDnaProfile);
  return useQuery({
    queryKey: ["dna", "profile", userId],
    queryFn: async () => toUI(await fetchDna()),
    enabled: !!userId,
    staleTime: 60_000,
    retry: 1,
  });
}
