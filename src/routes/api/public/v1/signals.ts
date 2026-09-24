import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

export const Route = createFileRoute("/api/public/v1/signals")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const { authenticateApiKey } = await import("@/lib/api-keys.server");
        const auth = await authenticateApiKey(request);
        if (!auth) return json({ error: "Chave de API inválida ou revogada." }, 401);

        const url = new URL(request.url);
        const status = url.searchParams.get("status")?.slice(0, 20) || "active";
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("signals")
          .select("id,pair,side,score,ai_score,entry_price,stop_loss,take_profit1,take_profit2,timeframe,status,created_at,expires_at")
          .eq("status", status)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) {
          console.error("[public-api] signals query failed", { message: error.message, keyId: auth.keyId });
          return json({ error: "Não foi possível carregar os sinais." }, 503);
        }
        return json({ data: data ?? [], meta: { count: data?.length ?? 0 } });
      },
    },
  },
});