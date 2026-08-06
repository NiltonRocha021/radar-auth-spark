// Fase 6.1 — STT do Copilot via Lovable AI Gateway (/v1/audio/transcriptions).
// O cliente envia o áudio gravado (multipart) e recebe o SSE de transcrição
// repassado sem buffering. Exige sessão autenticada (cookie SSR ou Bearer).
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "@/integrations/supabase/server-session";
import type { Database } from "@/integrations/supabase/types";

const STT_MODEL = "openai/gpt-4o-mini-transcribe";
const MAX_BYTES = 20 * 1024 * 1024;
const MIN_BYTES = 2048;

const EXT_BY_MIME: Record<string, string> = {
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
};

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

export const Route = createFileRoute("/api/copilot/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await resolveUserId(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI Gateway não configurado", { status: 503 });

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return new Response("Envio inválido (esperado multipart/form-data)", { status: 400 });
        }

        const audio = form.get("audio");
        if (!audio || typeof audio === "string") {
          return new Response("Campo 'audio' ausente", { status: 400 });
        }
        if (audio.size < MIN_BYTES) {
          return new Response("Gravação vazia ou muito curta — grave novamente.", { status: 400 });
        }
        if (audio.size > MAX_BYTES) {
          return new Response("Áudio muito grande (limite 20 MB).", { status: 413 });
        }

        const mime = (audio.type || "audio/webm").split(";")[0];
        const ext = EXT_BY_MIME[mime] ?? "webm";

        const upstream = new FormData();
        upstream.append("model", STT_MODEL);
        upstream.append("file", audio, `recording.${ext}`);
        upstream.append("stream", "true");

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstream,
        });

        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          console.error(`[copilot/transcribe] gateway ${res.status}: ${detail}`);
          return new Response(detail || "Falha na transcrição", { status: res.status });
        }

        return new Response(res.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
