import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/dashboard/top-bar";
import { LeftSidebar } from "@/components/dashboard/left-sidebar";
import { HeaderCard } from "@/components/profile/header-card";
import { ProfileForm } from "@/components/profile/profile-form";
import { TradingPreferences } from "@/components/profile/trading-preferences";
import { ConnectedAccounts } from "@/components/profile/connected-accounts";
import { DangerZone } from "@/components/profile/danger-zone";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — AISignalRadar" },
      { name: "description", content: "Manage your AISignalRadar identity, trading preferences and connected accounts." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
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

          <HeaderCard />
          <ProfileForm />
          <TradingPreferences />
          <ConnectedAccounts />
          <DangerZone />
        </main>
      </div>
    </div>
  );
}
