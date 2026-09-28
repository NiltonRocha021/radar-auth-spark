// Cron endpoint: pg_cron chama a cada minuto via net.http_post com header `apikey`.
// Rota pública porque pg_cron não carrega bearer do user; auth é feita no handler.
import { createFileRoute } from "@tanstack/react-router";

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export const Route = createFileRoute("/api/public/alerts/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        const apiKey = request.headers.get("apikey") ?? request.headers.get("Apikey");
        if (!anonKey || !apiKey || !constantTimeEqual(apiKey, anonKey)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { drainDispatchQueue } = await import("@/lib/alerts-dispatch.server");
          const result = await drainDispatchQueue({ limit: 100 });
          return Response.json(result);
        } catch (err: any) {
          console.error("[dispatch] error:", err);
          return new Response(`Error: ${err?.message ?? "unknown"}`, { status: 500 });
        }
      },
    },
  },
});
