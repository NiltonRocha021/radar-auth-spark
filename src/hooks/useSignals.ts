import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface BackendSignal {
  id: string;
  asset: string;
  direction: "BUY" | "SELL";
  entry: number;
  score: number;
  tf?: string;
  exchange?: string;
  [key: string]: unknown;
}

export function useSignals() {
  return useQuery({
    queryKey: ["signals"],
    queryFn: () => api.get<BackendSignal[]>("/signals"),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}
