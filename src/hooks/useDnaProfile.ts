// Rewire Fase R: consome a server function `getDnaProfile` no lugar do
// endpoint REST do Nest (`GET /dna/profile/:userId`). O `userId` deixou de
// ser argumento — a server fn tira sempre de `context.userId`, o que fecha
// o IDOR do controller antigo. Mantemos o parâmetro na assinatura só para
// gate de `enabled` (não passa a lógica adiante).
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDnaProfile, type DnaProfileDTO } from "@/lib/dna.functions";

/**
 * Shape que o `DnaHeader` já sabe ler (chaves `dnaConsistency`, etc.).
 * Populado apenas quando `DnaProfileDTO.data` contém essas chaves — caso
 * contrário devolvemos o DTO puro e o consumidor cai no fallback demo.
 */
export interface DnaProfileUI extends DnaProfileDTO {
  dnaConsistency?: number;
  dnaDiscipline?: number;
  dnaRiskControl?: number;
  dnaTiming?: number;
  dnaEmotionalControl?: number;
}

function toUI(dto: DnaProfileDTO): DnaProfileUI {
  const raw = (dto.data ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    ...dto,
    dnaConsistency: num(raw.dnaConsistency ?? raw.consistency),
    dnaDiscipline: num(raw.dnaDiscipline ?? raw.discipline),
    dnaRiskControl: num(raw.dnaRiskControl ?? raw.riskControl),
    dnaTiming: num(raw.dnaTiming ?? raw.timing),
    dnaEmotionalControl: num(raw.dnaEmotionalControl ?? raw.emotionalControl),
  };
}

export function useDnaProfile(userId: string | undefined) {
  const fetchDna = useServerFn(getDnaProfile);
  return useQuery({
    queryKey: ["dna", "profile", userId],
    queryFn: async () => toUI(await fetchDna()),
    enabled: !!userId,
    staleTime: 60_000,
  });
}
