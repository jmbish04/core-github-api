import { useNavigate, useParams } from "react-router-dom";
import { Settings, KeyRound, FolderCog, BrainCircuit } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralTab } from "@/components/settings/GeneralTab";
import { SecretsTab } from "@/components/settings/SecretsTab";
import { StandardizationsTab } from "@/components/settings/StandardizationsTab";
import { AIProvidersTab } from "@/components/settings/AIProvidersTab";

const TAB_SLUG_MAP: Record<string, string> = {
  general: "general",
  secrets: "secrets",
  standardizations: "standardizations",
  "ai-providers": "ai-providers",
};

const TAB_TO_SLUG: Record<string, string> = {
  general: "general",
  secrets: "secrets",
  standardizations: "standardizations",
  "ai-providers": "ai-providers",
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  const activeTab = TAB_SLUG_MAP[tab || ""] || "general";

  const handleTabChange = (value: string) => {
    const slug = TAB_TO_SLUG[value] || "general";
    navigate(`/control-center/settings/${slug}`, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure AI defaults, secrets, standardization policies, and provider
          integrations.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-6"
      >
        <TabsList>
          <TabsTrigger value="general" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="secrets" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Secrets & Environments
          </TabsTrigger>
          <TabsTrigger value="standardizations" className="gap-1.5">
            <FolderCog className="h-3.5 w-3.5" />
            Standardizations
          </TabsTrigger>
          <TabsTrigger value="ai-providers" className="gap-1.5">
            <BrainCircuit className="h-3.5 w-3.5" />
            AI Providers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>

        <TabsContent value="secrets">
          <SecretsTab />
        </TabsContent>

        <TabsContent value="standardizations">
          <StandardizationsTab />
        </TabsContent>

        <TabsContent value="ai-providers">
          <AIProvidersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
