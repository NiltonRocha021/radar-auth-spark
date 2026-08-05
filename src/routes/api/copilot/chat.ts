// Fase 6 — Streaming do Copilot via server route + Lovable AI Gateway.
// Substitui o WebSocket do NestJS (`ws-client` canal "copilot").
// Não fica sob /api/public/* — exige sessão autenticada (cookie SSR ou Bearer).
import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { createClient } from "@supabase/supabase-js";
import {
  createLovableAiGatewayProvider,
  getLovableAiGatewayRunId,
  COPILOT_MODEL,
} from "@/lib/ai-gateway.server";
import { getServerSession } from "@/integrations/supabase/server-session";
import type { Database } from "@/integrations/supabase/types";

interface InboundMessage {
  role: "user" | "assistant";
  content: string;
}

async function resolveUserId(request: Request): Promise<string | null> {
  const cookieSession = await getServerSession().catch(() => null);
  if (cookieSession) return cookieSession.userId;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !url || !key) return null;

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
}

function buildSystemPrompt(market: unknown, trader: unknown): string {
  return [
    "Você é o Copilot do AISignalRadar, um assistente de trading em português do Brasil.",
    "Seja direto, técnico e objetivo. Máximo ~120 palavras por resposta.",
    "Nunca prometa lucro garantido. Sempre lembre de gestão de risco quando sugerir operação.",
    "Use o contexto abaixo quando relevante; se um dado não estiver presente, diga que não tem a informação.",
    "",
    "CONTEXTO DE MERCADO (JSON):",
    JSON.stringify(market ?? {}),
    "",
    "PERFIL DO TRADER (JSON):",
    JSON.stringify(trader ?? {}),
  ].join("\n");
}

export const Route = createFileRoute("/api/copilot/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await resolveUserId(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response("AI Gateway não configurado", { status: 503 });
        }

        let body: {
          messages?: InboundMessage[];
          marketContext?: unknown;
          traderProfile?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return new Response("JSON inválido", { status: 400 });
        }

        const messages = (body.messages ?? [])
          .filter((m) => m && typeof m.content === "string" && m.content.trim().length > 0)
          .slice(-20)
          .map((m) => ({
            role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: m.content.slice(0, 4000),
          }));

        if (messages.length === 0) {
          return new Response("Mensagem vazia", { status: 400 });
        }

        const gateway = createLovableAiGatewayProvider(apiKey, getLovableAiGatewayRunId(request));

        try {
          const result = streamText({
            model: gateway(COPILOT_MODEL),
            system: buildSystemPrompt(body.marketContext, body.traderProfile),
            messages,
          });
          return result.toTextStreamResponse();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          console.error("[copilot/chat] gateway error:", message);
          return new Response(message, { status: 502 });
        }
      },
    },
  },
});
