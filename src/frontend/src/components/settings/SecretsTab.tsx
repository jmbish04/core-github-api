import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { handleGlobalSuccess } from '@/lib/success-handler';
import { handleGlobalPromise } from '@/lib/notification-handler';
import {
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Trash2,
} from "lucide-react";

const KNOWN_SECRETS = [
  {
    name: "WORKER_API_KEY",
    description: "Internal worker-to-worker authentication",
  },
  {
    name: "OPENAI_API_KEY",
    description: "OpenAI API access via AI Gateway",
  },
  {
    name: "ANTHROPIC_API_KEY",
    description: "Anthropic Claude API access via AI Gateway",
  },
  {
    name: "GEMINI_API_KEY",
    description: "Google Gemini API access via AI Gateway",
  },
  {
    name: "GH_TOKEN",
    description: "GitHub Personal Access Token for API operations",
  },
  {
    name: "CLOUDFLARE_API_TOKEN",
    description: "Cloudflare API token for account management",
  },
  {
    name: "GITHUB_WEBHOOK_SECRET",
    description: "Shared secret for GitHub webhook signature verification",
  },
];

type SecretEntry = {
  name: string;
  description: string;
  active: boolean;
};

export function SecretsTab() {
  const [secrets, setSecrets] = useState<SecretEntry[]>(
    KNOWN_SECRETS.map((s) => ({
      ...s,
      active: ["WORKER_API_KEY", "OPENAI_API_KEY", "GH_TOKEN"].includes(
        s.name,
      ),
    })),
  );
  const [selectedSecret, setSelectedSecret] = useState("");

  const activeSecrets = secrets.filter((s) => s.active);
  const inactiveSecrets = secrets.filter((s) => !s.active);

  const handleToggle = (name: string) => {
    setSecrets((prev) =>
      prev.map((s) => (s.name === name ? { ...s, active: !s.active } : s)),
    );
    const secret = secrets.find((s) => s.name === name);
    if (secret) {
      handleGlobalSuccess(
        'Secret Updated',
        secret.active
          ? `Removed ${name} from default sync list`
          : `Added ${name} to default sync list`,
      );
    }
  };

  const handleAddCustom = () => {
    if (!selectedSecret) return;
    const existing = secrets.find((s) => s.name === selectedSecret);
    if (existing && !existing.active) {
      handleToggle(selectedSecret);
    }
    setSelectedSecret("");
  };

  const handleForceSync = () => {
    handleGlobalPromise(new Promise((r) => setTimeout(r, 2000)), {
      loading: "Force syncing secrets to ALL connected repositories…",
      success: "Sync command queued for all repositories",
      error: "Failed to queue sync",
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <KeyRound className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <CardTitle>Default Secrets Policy</CardTitle>
              <CardDescription>
                Secrets auto-provisioned to repository environments during
                standardization.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
            <p className="text-sm text-yellow-400">
              <ShieldAlert className="mr-1.5 inline-block h-4 w-4" />
              Secret <strong>values</strong> are read securely from the Worker
              environment at runtime. Only <em>names</em> are stored and synced
              here.
            </p>
          </div>

          {/* Active secrets */}
          <div className="space-y-3">
            <Label className="text-muted-foreground">Active Defaults</Label>
            {activeSecrets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No secrets are currently active.
              </p>
            ) : (
              <div className="grid gap-2">
                {activeSecrets.map((secret) => (
                  <div
                    key={secret.name}
                    className="group flex items-center justify-between rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-border"
                  >
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                      <div>
                        <span className="font-mono text-sm font-medium">
                          {secret.name}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {secret.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      >
                        Active
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => handleToggle(secret.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Add inactive secret */}
          {inactiveSecrets.length > 0 && (
            <div className="space-y-3">
              <Label className="text-muted-foreground">
                Available Secrets
              </Label>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Select
                    value={selectedSecret}
                    onValueChange={setSelectedSecret}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a secret to activate…" />
                    </SelectTrigger>
                    <SelectContent>
                      {inactiveSecrets.map((s) => (
                        <SelectItem key={s.name} value={s.name}>
                          <span className="font-mono">{s.name}</span>
                          <span className="ml-2 text-muted-foreground">
                            — {s.description}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddCustom} disabled={!selectedSecret}>
                  <Plus className="mr-2 h-4 w-4" />
                  Activate
                </Button>
              </div>
            </div>
          )}

          <Separator />

          {/* Force sync */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Bulk Sync</p>
              <p className="text-xs text-muted-foreground">
                Push all active defaults to every connected repository
                environment.
              </p>
            </div>
            <Button variant="destructive" onClick={handleForceSync}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Force Sync to All Repos
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
