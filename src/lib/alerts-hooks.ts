// React Query hooks para o módulo de Alertas.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAlertPreferences,
  saveAlertPreferences,
  getAlertFeed,
  markAlertRead,
  markAllAlertsRead,
  clearAlertFeed,
  sendTestAlert,
  type AlertPreferences,
} from "./alerts.functions";

export function useAlertPreferences() {
  const fn = useServerFn(getAlertPreferences);
  return useQuery({
    queryKey: ["alert-preferences"],
    queryFn: () => fn(),
  });
}

export function useSaveAlertPreferences() {
  const qc = useQueryClient();
  const fn = useServerFn(saveAlertPreferences);
  return useMutation({
    mutationFn: (patch: Parameters<typeof fn>[0]["data"]) => fn({ data: patch }),
    onSuccess: (data) => {
      qc.setQueryData(["alert-preferences"], data as AlertPreferences);
    },
  });
}

export function useAlertFeed(limit = 50) {
  const fn = useServerFn(getAlertFeed);
  return useQuery({
    queryKey: ["alert-feed", limit],
    queryFn: () => fn({ data: { limit } }),
    refetchInterval: 30_000,
  });
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  const fn = useServerFn(markAlertRead);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-feed"] }),
  });
}

export function useMarkAllAlertsRead() {
  const qc = useQueryClient();
  const fn = useServerFn(markAllAlertsRead);
  return useMutation({
    mutationFn: () => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-feed"] }),
  });
}

export function useClearAlertFeed() {
  const qc = useQueryClient();
  const fn = useServerFn(clearAlertFeed);
  return useMutation({
    mutationFn: () => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-feed"] }),
  });
}

export function useSendTestAlert() {
  const qc = useQueryClient();
  const fn = useServerFn(sendTestAlert);
  return useMutation({
    mutationFn: () => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-feed"] }),
  });
}
