import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getControlCenterUserId } from "@/lib/control-user";

type SettingsResponse = {
  success: boolean;
  settings: {
    userId: string;
    preferredProvider: string;
    preferredModel: string;
    enforceGoldenPath: boolean;
    customInstructions: string;
    goldenPathOverrides: Record<string, unknown>;
  };
  goldenPath: {
    defaults: Record<string, string[]>;
    systemPrompt: string;
  };
};

export function GeneralTab() {
  const queryClient = useQueryClient();
  const userId = getControlCenterUserId();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["settings", userId],
    queryFn: async () => {
      const response = await fetch(
        `/api/settings?userId=${encodeURIComponent(userId)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to load settings");
      return (await response.json()) as SettingsResponse;
    },
  });

  const [preferredProvider, setPreferredProvider] = useState("worker-ai");
  const [preferredModel, setPreferredModel] = useState(
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  );
  const [customInstructions, setCustomInstructions] = useState("");
  const [enforceGoldenPath, setEnforceGoldenPath] = useState(true);

  useEffect(() => {
    if (!data?.settings) return;
    setPreferredProvider(data.settings.preferredProvider || "worker-ai");
    setPreferredModel(
      data.settings.preferredModel ||
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    );
    setCustomInstructions(data.settings.customInstructions || "");
    setEnforceGoldenPath(Boolean(data.settings.enforceGoldenPath));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId,
          preferredProvider,
          preferredModel,
          enforceGoldenPath,
          customInstructions,
          goldenPathOverrides: {},
        }),
      });
      if (!response.ok) throw new Error("Failed to save settings");
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings", userId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data?.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Settings unavailable</CardTitle>
          <CardDescription>
            Unable to load the Control Center settings.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI Defaults</CardTitle>
          <CardDescription>
            Configure the default AI provider and model for agent outputs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Preferred Provider</label>
              <Input
                value={preferredProvider}
                onChange={(event) => setPreferredProvider(event.target.value)}
                placeholder="worker-ai"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Preferred Model</label>
              <Input
                value={preferredModel}
                onChange={(event) => setPreferredModel(event.target.value)}
                placeholder="@cf/meta/llama-3.3-70b-instruct-fp8-fast"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Custom Instructions</label>
            <Textarea
              rows={4}
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.target.value)}
              placeholder="Add team-specific architecture defaults."
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enforceGoldenPath}
              onChange={(event) => setEnforceGoldenPath(event.target.checked)}
              className="accent-primary"
            />
            Enforce Cloudflare Worker Golden Path in agent outputs
          </label>

          <div className="flex justify-end">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Golden Path Defaults</CardTitle>
          <CardDescription>
            Canonical architecture standards enforced by the agent layer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(data.goldenPath.defaults).map(([group, values]) => (
            <div key={group} className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </h3>
              <ul className="space-y-1 text-sm">
                {values.map((value) => (
                  <li key={value} className="rounded border px-3 py-2">
                    {value}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              System Prompt
            </h3>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded border bg-muted/40 p-3 text-xs">
              {data.goldenPath.systemPrompt}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
