import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, User, AlertTriangle } from "lucide-react";
import { TopBar } from "@/components/dashboard/top-bar";
import { LeftSidebar } from "@/components/dashboard/left-sidebar";
import { HeaderCard } from "@/components/profile/header-card";
import { ProfileForm } from "@/components/profile/profile-form";
import { TradingPreferences } from "@/components/profile/trading-preferences";
import { ConnectedAccounts } from "@/components/profile/connected-accounts";
import { DangerZone } from "@/components/profile/danger-zone";
import { WishlistTab } from "@/components/profile/wishlist-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — AISignalRadar" },
      { name: "description", content: "Manage your AISignalRadar identity, trading preferences and connected accounts." },
    ],
  }),
  // `tab` é opcional: sem ele a página abre na aba "profile". Manter opcional
  // é o que permite `<Link to="/profile">` sem `search` obrigatório.
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "wishlist" ? ("wishlist" as const) : undefined,
  }),
  errorComponent: ProfileErrorState,
  component: ProfilePage,
});

/** Erro inline — mantém o shell e evita tela em branco. */
function ProfileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <div className="flex">
        <LeftSidebar />
        <main className="flex-1 min-w-0 p-5 space-y-5 max-w-5xl">
          <header>
            <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">Your identity, preferences, and integrations.</p>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

function ProfileErrorState({ error }: { error: Error }) {
  return (
    <ProfileShell>
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>Não foi possível carregar seu perfil</AlertTitle>
        <AlertDescription>
          {error?.message || "Erro inesperado."}{" "}
          <Link to="/dashboard" className="underline">Voltar ao dashboard</Link>
        </AlertDescription>
      </Alert>
    </ProfileShell>
  );
}

function ProfilePage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { session, loading } = useAuth();
  const activeTab = tab ?? "profile";

  // Proteção defensiva: a rota já vive sob `_authenticated`, mas evitamos
  // renderizar formulários de perfil sem sessão (e sem tela em branco).
  if (loading) {
    return (
      <ProfileShell>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </ProfileShell>
    );
  }

  if (!session?.user) {
    return (
      <ProfileShell>
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Sessão necessária</AlertTitle>
          <AlertDescription>
            Faça login para ver e editar seu perfil.{" "}
            <Link to="/login" className="underline">Ir para o login</Link>
          </AlertDescription>
        </Alert>
      </ProfileShell>
    );
  }


  return (
    <ProfileShell>
      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          navigate({ search: { tab: v === "wishlist" ? ("wishlist" as const) : undefined } })
        }
        className="space-y-5"
      >

            <TabsList>
              <TabsTrigger value="profile" className="gap-2"><User className="size-3.5" /> Profile</TabsTrigger>
              <TabsTrigger value="wishlist" className="gap-2"><Heart className="size-3.5" /> Wishlist</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-5">
              <HeaderCard />
              <ProfileForm />
              <TradingPreferences />
              <ConnectedAccounts />
              <DangerZone />
            </TabsContent>

            <TabsContent value="wishlist">
              <WishlistTab />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
