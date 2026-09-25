import { SectionCard } from "./section-card";
import { KeysManagement } from "@/components/api/keys-management";
import { BinanceCredentialsCard } from "./binance-credentials-card";

export function SettingsApiKeys() {
  return (
    <SectionCard title="API Keys" description="Gestão de chaves de API.">
      <KeysManagement />
      <BinanceCredentialsCard />
    </SectionCard>
  );
}
