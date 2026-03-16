import React, { useEffect, useState } from "react";
import { ConfigHeader } from "./Header";
import { ConfigSidebar } from "./ConfigSidebar";
import { ConfigTable, type ConfigFieldDef } from "./ConfigTable";
import { AuditTable, type AuditLogEntry } from "./AuditTable";
import { SyncSecretsConfig } from "./SyncSecretsConfig";
import { SkillsManager } from "./SkillsManager";
import { Loader2 } from "lucide-react";

interface ConfigDashboardProps {
  category: string;
}

interface RepoSecretDefault {
  id: string;
  secretName: string;
  description: string | null;
  isActive: boolean;
}

// Field definitions for each category
const FIELD_DEFINITIONS: Record<string, ConfigFieldDef[]> = {
  general: [
    { key: "CLOUDFLARE_ACCOUNT_ID", label: "Cloudflare Account ID", type: "string", description: "Your Cloudflare Account ID" },
    { key: "CLOUDFLARE_API_TOKEN", label: "Cloudflare API Token", type: "secret", description: "Token for Cloudflare API access" },
    { key: "WORKER_API_KEY", label: "Worker API Key", type: "secret", description: "Master key for worker authentication" },
  ],
  ai: [
    { key: "OPENAI_API_KEY", label: "OpenAI API Key", type: "secret" },
    { key: "OPENAI_MODEL", label: "OpenAI Model", type: "string", description: "Default: gpt-4o" },
    { key: "GEMINI_API_KEY", label: "Gemini API Key", type: "secret" },
    { key: "GEMINI_MODEL", label: "Gemini Model", type: "string", description: "Default: gemini-1.5-pro" },
    { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key", type: "secret" },
    { key: "AI_GATEWAY_TOKEN", label: "AI Gateway Token", type: "secret" },
  ],
  github: [
    { key: "GITHUB_TOKEN", label: "GitHub Token", type: "secret", description: "Personal Access Token" },
    { key: "GITHUB_APP_ID", label: "GitHub App ID", type: "string" },
    { key: "GITHUB_PRIVATE_KEY", label: "GitHub App Private Key", type: "secret", description: "PEM format key" },
    { key: "GITHUB_WEBHOOK_SECRET", label: "Webhook Secret", type: "secret" },
  ],
  secrets: [
    // Aggregate all secrets or specific others?
    // For now, list common ones again or other secrets
    { key: "DATABASE_URL", label: "Database URL", type: "secret" },
  ]
};

export function ConfigDashboard({ category }: ConfigDashboardProps) {
  const [data, setData] = useState<Record<string, any>>({});
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const API_BASE = "/api/config";

  const fetchData = async () => {
    setLoading(true);
    try {
      if (category === "history") {
         const res = await fetch(`${API_BASE}/history`);
         if(!res.ok) throw new Error("Failed to fetch history");
         const json = (await res.json()) as any;
         setLogs(json.logs || []);
      } else {
         const res = await fetch(API_BASE);
         if(!res.ok) throw new Error("Failed to fetch config");
         const json = (await res.json()) as any;
         const configMap = Array.isArray(json.settings)
           ? Object.fromEntries(json.settings.map((entry: any) => [entry.key, entry.value]))
           : (json.config || {});
         setData({
           ...configMap,
           __repoSecretDefaults: (json.repoSecretDefaults || []) as RepoSecretDefault[],
         });
      }
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [category]);

  const handleSave = async (key: string, value: any) => {
    try {
      const res = await fetch(API_BASE, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error("Failed to save");
      // Refresh data
      await fetchData();
    } catch (e) {
      console.error("Save error:", e);
      throw e;
    }
  };

  const isHistory = category === "history";
  const fields = FIELD_DEFINITIONS[category] || [];

  return (
    <div className="flex h-screen w-full bg-background">
      <ConfigSidebar currentCategory={category} />
      <div className="flex flex-1 flex-col">
        <ConfigHeader title={`Configuration: ${category.charAt(0).toUpperCase() + category.slice(1)}`} onRefresh={fetchData} isRefreshing={loading} />
        <main className="flex-1 overflow-auto p-6">
          {loading && !data && logs.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            isHistory ? (
                <AuditTable logs={logs} />
            ) : (
                <div className="space-y-6">
                  <ConfigTable data={data} fields={fields} onSave={handleSave} />
                  {category === "secrets" && (
                    <SyncSecretsConfig
                      repoSecretDefaults={(data.__repoSecretDefaults || []) as RepoSecretDefault[]}
                      onConfigChanged={fetchData}
                    />
                  )}
                  {category === "skills" && (
                    <SkillsManager />
                  )}
                </div>
            )
          )}
        </main>
      </div>
    </div>
  );
}
