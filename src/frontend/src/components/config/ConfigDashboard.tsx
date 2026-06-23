import React, { useEffect, useState, useCallback } from "react";
import { ConfigHeader } from "./Header";
import { ConfigSidebar } from "./ConfigSidebar";
import { ConfigTable, type ConfigFieldDef } from "./ConfigTable";
import { AuditTable, type AuditLogEntry } from "./AuditTable";
import { SyncSecretsConfig } from "./SyncSecretsConfig";
import { SkillsManager } from "./SkillsManager";
import { StandardizationConfig } from "./StandardizationConfig";
import { AgentConfigManager } from "./agents/AgentConfigManager";
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

interface SystemConfigDefinition {
  id: string;
  category: string;
  configKey: string;
  label: string;
  type: string;
  description: string | null;
}


export function ConfigDashboard({ category }: ConfigDashboardProps) {
  const [data, setData] = useState<Record<string, any>>({});
  const [fieldDefinitions, setFieldDefinitions] = useState<Record<string, ConfigFieldDef[]>>({});
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const API_BASE = "/api/config";

  const fetchData = useCallback(async () => {
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

         const rawFields = (json.configFields || []) as SystemConfigDefinition[];
         const grouped: Record<string, ConfigFieldDef[]> = {};
         for (const f of rawFields) {
            if (!grouped[f.category]) grouped[f.category] = [];
            grouped[f.category].push({
               key: f.configKey,
               label: f.label,
               type: f.type as any,
               description: f.description || undefined,
            });
         }
         
         setFieldDefinitions(grouped);
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
  }, [category]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
  const isAgentConfig = category === "agents-ai";
  const fields = fieldDefinitions[category] || [];

  return (
    <div className="flex h-screen w-full bg-background">
      <ConfigSidebar currentCategory={category} />
      <div className="flex flex-1 flex-col">
        <ConfigHeader title={`Configuration: ${category.charAt(0).toUpperCase() + category.slice(1)}`} onRefresh={fetchData} isRefreshing={loading} />
        <main className="flex-1 overflow-auto p-6">
          {isAgentConfig ? (
            <AgentConfigManager />
          ) : loading && !data && logs.length === 0 ? (
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
                  {category === "standardization" && (
                    <StandardizationConfig />
                  )}
                </div>
            )
          )}
        </main>
      </div>
    </div>
  );
}
