// Hook de leitura do estado do Bot4x Calibration Engine (BCE).
// Fase 5: sem WebSocket e sem adapter NestJS — TanStack Query sobre a server fn
// `getCalibratorState`, com refetch periódico.
import { useQuery } from "@tanstack/react-query";
import { getCalibratorState } from "@/lib/calibrator.functions";
import type { CalibratorStateUI } from "@/lib/calibrator";

export interface UseCalibratorStateResult {
  data: CalibratorStateUI | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useCalibratorState(userId: string | undefined): UseCalibratorStateResult {
  const query = useQuery({
    queryKey: ["calibrator", "state", userId ?? null],
    queryFn: () => getCalibratorState(),
    enabled: Boolean(userId),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isPending && Boolean(userId),
    error: (query.error as Error | null) ?? null,
    refetch: query.refetch,
  };
}
