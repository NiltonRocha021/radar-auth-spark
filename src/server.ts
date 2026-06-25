import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function addSecurityHeaders(response: Response, nonce: string): Response {
  const headers = new Headers(response.headers);

  // ──────────────────────────────────────────────────────────────────────
  // connect-src — hosts EXPLÍCITOS derivados das envs públicas.
  // Schemes genéricos (`wss:`, `https:`) anulam a proteção da CSP contra
  // SSRF / exfiltração via fetch ou WebSocket, então NÃO os usamos.
  //
  // Para liberar um novo host backend, adicione-o aqui E documente a env
  // correspondente no `.env.example`. Mantenha as duas fontes em sincronia
  // — uma origem que não esteja listada aqui será bloqueada pelo browser
  // mesmo que o código tente conectar.
  // ──────────────────────────────────────────────────────────────────────
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";
  const apiBase = process.env.VITE_API_BASE_URL ?? "";
  const apiWs = process.env.VITE_API_WS_URL ?? "";
  const isDev = process.env.NODE_ENV !== "production";

  // Normaliza para SCHEME + HOST (sem path), evitando que um path acidental
  // em VITE_API_BASE_URL gere uma diretiva CSP inválida.
  const toOrigin = (raw: string): string => {
    if (!raw) return "";
    try {
      return new URL(raw).origin;
    } catch {
      return "";
    }
  };

  const supabaseOrigin = toOrigin(supabaseUrl);
  // Realtime do Supabase usa o mesmo host via wss://.
  const supabaseWss = supabaseOrigin ? supabaseOrigin.replace(/^https?:/, "wss:") : "";
  const apiOrigin = toOrigin(apiBase);
  const apiWsOrigin = toOrigin(apiWs);

  // Em desenvolvimento local, libera o HMR/dev server do Vite e o backend
  // NestJS rodando em localhost — sem isso, `pnpm dev` quebra com a CSP.
  const devOrigins = isDev
    ? ["http://localhost:*", "ws://localhost:*", "http://127.0.0.1:*", "ws://127.0.0.1:*"]
    : [];

  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}'`;

  // TODO(csp): substituir 'unsafe-inline' por 'nonce-${nonce}' em style-src
  // assim que o pipeline do Tailwind v4 não emitir mais <style> inline sem
  // controle nosso (atualmente quebraria SSR styles).
  const styleSrc = "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com";

  const connectSrc = [
    "connect-src 'self'",
    supabaseOrigin,
    supabaseWss,
    apiOrigin,
    apiWsOrigin,
    ...devOrigins,
  ]
    .filter(Boolean)
    .join(" ");

  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      scriptSrc,
      styleSrc,
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      connectSrc,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  );

  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );

  // HSTS apenas em produção — em dev pode rodar em http://localhost e
  // ligar HSTS lá travaria o navegador em https. 2 anos + includeSubDomains
  // + preload são os requisitos para submissão à preload list do Chromium.
  if (!isDev) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}


function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

function withTraceHeader(response: Response, traceId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-trace-id", traceId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const traceId =
      request.headers.get("x-trace-id") ?? crypto.randomUUID();
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const traced = withTraceHeader(normalized, traceId);
      const contentType = traced.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        return addSecurityHeaders(traced, nonce);
      }
      return traced;
    } catch (error) {
      console.error("[server] fetch failed", { traceId }, error);
      return withTraceHeader(
        addSecurityHeaders(brandedErrorResponse(), nonce),
        traceId,
      );
    }
  },
};
