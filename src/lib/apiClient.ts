// TODO: MIGRAÇÃO — removido na Fase 6 (ver MIGRATION_NOTES.md)
import axios, { type InternalAxiosRequestConfig, type AxiosError } from "axios";
import { supabase } from "@/integrations/supabase/client";
import { Sentry } from "./sentry";
import { generateTraceId, getTraceId, setTraceId } from "./trace-context";

// InternalAxiosRequestConfig augmentado com nosso traceId para correlação.
type TracedConfig = InternalAxiosRequestConfig & {
  _traceId?: string;
  _retry?: boolean;
  _retryCount?: number;
};

// Erros que vale a pena tentar novamente (rede/timeout/servidor indisponível).
const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Resolução da URL base
// ---------------------------------------------------------------------------
// Em produção, EXIGIR VITE_API_BASE_URL. Em dev, cair para localhost.
// Sem esse fail-fast, o app enviaria o JWT do usuário para localhost:3001
// no navegador do cliente final — risco real de vazamento de token.
function resolveApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

  if (envUrl) {
    // Garante que não termine com "/" para evitar duplos-slash nas rotas.
    return envUrl.replace(/\/$/, "");
  }

  if (import.meta.env.PROD) {
    // Lança em vez de silenciar: deploy sem a variável é erro de configuração,
    // não um estado recuperável. A mensagem aparece nos logs do Sentry/Cloudflare.
    const msg =
      "[apiClient] VITE_API_BASE_URL não definida em produção. " +
      "Todas as chamadas REST serão bloqueadas para proteger o JWT do usuário. " +
      "Adicione a variável no painel do seu provedor de hospedagem.";
    console.error(msg);
    Sentry.captureMessage(msg, "fatal");
    return ""; // string vazia → interceptor rejeita cada requisição individualmente
  }

  // Desenvolvimento local
  return "http://localhost:3001/api";
}

export const BASE_URL = resolveApiBaseUrl();

// ---------------------------------------------------------------------------
// Instância Axios
// ---------------------------------------------------------------------------
export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
  },
  // withCredentials removido: autenticação é Bearer JWT no header.
  // Manter true abriria superfície de CSRF sem mitigação correspondente.
});

// ---------------------------------------------------------------------------
// Interceptor de requisição: guard de URL + JWT + trace ID
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use(async (config) => {
  // Bloqueia qualquer chamada se a URL base não foi configurada.
  if (!BASE_URL) {
    return Promise.reject(
      new Error("API base URL não configurada. " + "Defina VITE_API_BASE_URL nas variáveis de ambiente do projeto."),
    );
  }

  const traced = config as TracedConfig;

  // Garante trace ID único por requisição; reutiliza se já existir (retry).
  const traceId = traced._traceId ?? generateTraceId();
  traced._traceId = traceId;
  config.headers["x-trace-id"] = traceId;

  // Propaga via contexto para que o interceptor de erro e o WS possam ler
  // o trace_id sem depender de error.config.
  setTraceId(traceId);

  // Anexa o JWT do Supabase se houver sessão ativa.
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    // Sessão ilegível — loga mas não bloqueia (a API vai responder 401).
    console.warn("[apiClient] Erro ao ler sessão Supabase:", sessionError.message);
  }
  const token = data?.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// ---------------------------------------------------------------------------
// Interceptor de resposta: renovação em 401 + retry em 429/5xx + Sentry
// ---------------------------------------------------------------------------
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = (error.config ?? {}) as TracedConfig;
    const status = error.response?.status;

    // --- 1. Renovação de token em 401 (uma tentativa por requisição) ---
    if (status === 401 && !original._retry) {
      original._retry = true;
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && data.session) {
        original.headers!.Authorization = `Bearer ${data.session.access_token}`;
        return apiClient(original);
      }
      // Refresh falhou → sessão expirada, deixa o erro 401 subir normalmente.
    }

    // --- 2. Retry com back-off exponencial para erros transientes ---
    const retryCount = original._retryCount ?? 0;
    const isRetryable =
      RETRYABLE_STATUSES.has(status ?? 0) ||
      error.code === "ECONNABORTED" || // timeout
      error.code === "ERR_NETWORK"; // sem rede

    if (isRetryable && retryCount < MAX_RETRIES) {
      original._retryCount = retryCount + 1;
      const delay = 500 * 2 ** retryCount; // 500ms, 1000ms
      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiClient(original);
    }

    // --- 3. Captura estruturada no Sentry ---
    const traceId = original._traceId ?? getTraceId();
    Sentry.withScope((scope) => {
      if (traceId) scope.setTag("trace_id", traceId);
      scope.setContext("request", {
        url: original.url,
        baseURL: original.baseURL,
        method: original.method,
        status,
        retries: original._retryCount ?? 0,
      });
      // Adiciona dados da resposta quando disponíveis (útil para 4xx).
      if (error.response?.data) {
        scope.setContext("response_body", error.response.data as Record<string, unknown>);
      }
      Sentry.captureException(error);
    });

    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// Helper de alto nível — compatível com uso anterior (api.get / api.post…)
// ---------------------------------------------------------------------------
export const api = {
  get: <T = unknown,>(path: string) => apiClient.get<T>(path).then((r) => r.data),

  post: <T = unknown,>(path: string, body: unknown) => apiClient.post<T>(path, body).then((r) => r.data),

  patch: <T = unknown,>(path: string, body: unknown) => apiClient.patch<T>(path, body).then((r) => r.data),

  put: <T = unknown,>(path: string, body: unknown) => apiClient.put<T>(path, body).then((r) => r.data),

  delete: <T = unknown,>(path: string) => apiClient.delete<T>(path).then((r) => r.data),
};
