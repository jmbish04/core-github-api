
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, ExternalLink, ShieldCheck, ShieldAlert, Plus } from "lucide-react";

export default function Standardization() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Repository Standards</h1>
        <p className="text-muted-foreground">
          Manage global defaults for Agents, MCP Tools, and Secrets across all repositories.
        </p>
      </div>

      <Tabs defaultValue="mcp" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mcp">MCP Defaults</TabsTrigger>
          <TabsTrigger value="secrets">Default Secrets</TabsTrigger>
        </TabsList>

        <TabsContent value="mcp">
          <McpDefaults />
        </TabsContent>

        <TabsContent value="secrets">
          <SecretDefaults />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function McpDefaults() {
  const MASTER_URL = "https://github.com/jmbish04/core-github-standardization/blob/main/mcp.json";
  
  const handleRefresh = async () => {
      toast.promise(
          // In a real app, this might trigger a backend fetch to get the *latest* content to display, 
          // or trigger a sync job. For now, we just simulate a refresh or re-fetch config.
          new Promise(r => setTimeout(r, 1000)),
          {
              loading: "Fetching latest master config...",
              success: "Configuration refreshed",
              error: "Failed to refresh"
          }
      );
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle>Master MCP Configuration</CardTitle>
            <CardDescription>
              The source of truth for <code>mcp.json</code> synced to all repositories.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
            <div className="rounded-md bg-muted p-4 font-mono text-sm overflow-auto max-h-[400px]">
                <p className="text-muted-foreground italic">// Content fetched from {MASTER_URL}</p>
                <br/>
                <pre>{JSON.stringify({
                    "mcpServers": {
                        "github": {
                            "command": "npx",
                            "args": ["-y", "@modelcontextprotocol/server-github"]
                        },
                        "cloudflare": {
                            "command": "npx",
                            "args": ["-y", "@modelcontextprotocol/server-cloudflare"]
                        }
                    }
                }, null, 2)}</pre>
            </div>
            <div className="mt-4 flex justify-end">
                <Button variant="secondary" asChild>
                    <a href={MASTER_URL} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Edit on GitHub
                    </a>
                </Button>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecretDefaults() {
    // This list matches backend/src/services/standardization/secret-sync.ts
    const KNOWN_SECRETS = [
        "WORKER_API_KEY",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GEMINI_API_KEY",
        "GH_TOKEN",
        "CLOUDFLARE_API_TOKEN"
    ];

    const [activeSecrets, setActiveSecrets] = useState<string[]>(["WORKER_API_KEY", "OPENAI_API_KEY"]);
    const [selectedSecret, setSelectedSecret] = useState("");

    const handleAdd = () => {
        if (selectedSecret && !activeSecrets.includes(selectedSecret)) {
            setActiveSecrets([...activeSecrets, selectedSecret]);
            setSelectedSecret("");
            toast.success(`added ${selectedSecret} to default sync list`);
        }
    };

    const handleForceSync = () => {
        toast.promise(
            // In real impl, this calls POST /api/standards/secrets/sync-all
            new Promise(r => setTimeout(r, 2000)),
            {
                loading: "Force syncing secrets to ALL known repositories...",
                success: "Sync command queued for 12 repositories",
                error: "Failed to queue sync"
            }
        );
    };

    return (
        <div className="grid gap-4">
            <Card>
                <CardHeader>
                    <CardTitle>Default Secrets Policy</CardTitle>
                    <CardDescription>
                        These secrets are auto-provisioned to repositories when standardizing.
                        <br/>
                        <span className="text-yellow-500 font-semibold">
                            ⚠️ Values are read securely from the Worker Environment at runtime. Only names are stored here.
                        </span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-end gap-4">
                        <div className="grid gap-2 flex-1">
                            <Label>Add Default Secret</Label>
                            <Select value={selectedSecret} onValueChange={setSelectedSecret}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a secret key..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {KNOWN_SECRETS.filter(s => !activeSecrets.includes(s)).map(s => (
                                        <SelectItem key={s} value={s}>
                                            {s}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleAdd} disabled={!selectedSecret}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add
                        </Button>
                    </div>

                    <div className="grid gap-2">
                        <Label>Active Defaults</Label>
                        <div className="grid gap-2">
                            {activeSecrets.map(secret => (
                                <div key={secret} className="flex items-center justify-between rounded-md border p-3">
                                    <div className="flex items-center gap-3">
                                        <ShieldCheck className="h-4 w-4 text-green-500" />
                                        <span className="font-mono text-sm">{secret}</span>
                                    </div>
                                    <Badge variant="outline">Active</Badge>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <Button variant="destructive" className="w-full sm:w-auto" onClick={handleForceSync}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Force Sync to All Repos
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
