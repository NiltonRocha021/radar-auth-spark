import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/dashboard/top-bar";
import { LeftSidebar } from "@/components/dashboard/left-sidebar";
import { DnaPairRecommendations } from "@/components/dna/dna-pair-recommendations";

export const Route = createFileRoute("/_authenticated/dna-pairs")({
  head: () => ({
    meta: [
      { title: "DNA Pares — AISignalRadar" },
      { name: "description", content: "Análise por par: sequências de 3, tendência e volume. Recomendações de pares para o Bot4x." },
    ],
  }),
  component: DnaPairsPage,
});

function DnaPairsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <div className="flex">
        <LeftSidebar />
        <main className="flex-1 min-w-0 p-5 space-y-5">
          <header>
            <h1 className="text-xl font-semibold tracking-tight">DNA — Pares Recomendados</h1>
            <p className="text-sm text-muted-foreground mt-1">
              O DNA analisa o histórico de cada par: 3 trades positivos/negativos consecutivos, tendência e volume. Pares com mais sucesso são priorizados; pares em sequência negativa são bloqueados no Bot4x.
            </p>
          </header>
          <DnaPairRecommendations />
        </main>
      </div>
    </div>
  );
}
