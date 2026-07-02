// Cron endpoint: pg_cron chama a cada minuto via net.http_post com header `apikey`.
// Rota pública porque pg_cron não carrega bearer do user; auth é feita no handler.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/alerts/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        const apiKey = request.headers.get("apikey") ?? request.headers.get("Apikey");
        if (!anonKey || apiKey !== anonKey) {
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
