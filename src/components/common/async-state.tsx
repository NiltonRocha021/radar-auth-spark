// Camada compartilhada de estados assíncronos (loading / erro / vazio).
// Mensagens amigáveis, sem jargão técnico, com ação de retry opcional.
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Carregando dados...", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-lg border border-border bg-card/40 animate-pulse" />
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Não foi possível carregar",
  message = "Houve uma falha ao buscar os dados. Verifique sua conexão e tente novamente.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center flex flex-col items-center gap-2"
    >
      <AlertTriangle className="size-5 text-destructive" aria-hidden />
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground max-w-md">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw className="size-3.5 mr-1.5" aria-hidden />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title = "Nada por aqui ainda",
  message = "Assim que houver novos dados, eles aparecem automaticamente nesta tela.",
  action,
}: {
  title?: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/30 p-8 text-center flex flex-col items-center gap-2">
      <Inbox className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground max-w-md">{message}</p>
      {action}
    </div>
  );
}

/**
 * Wrapper declarativo: escolhe entre loading / erro / vazio / conteúdo.
 */
export function AsyncState({
  isLoading,
  error,
  isEmpty,
  onRetry,
  loading,
  empty,
  errorTitle,
  errorMessage,
  children,
}: {
  isLoading?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  loading?: React.ReactNode;
  empty?: React.ReactNode;
  errorTitle?: string;
  errorMessage?: string;
  children: React.ReactNode;
}) {
  if (isLoading) return <>{loading ?? <LoadingState />}</>;
  if (error) {
    return (
      <ErrorState
        title={errorTitle}
        message={errorMessage ?? (error instanceof Error ? error.message : undefined)}
        onRetry={onRetry}
      />
    );
  }
  if (isEmpty) return <>{empty ?? <EmptyState />}</>;
  return <>{children}</>;
}
