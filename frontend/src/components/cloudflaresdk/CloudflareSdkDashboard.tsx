import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cloud, GitMerge, FileCode2, Terminal, Settings, DollarSign } from "lucide-react";
import { BindingsTable } from "./BindingsTable";
import { DeploymentsList } from "./DeploymentsList";
import { LogStreamer } from "./LogStreamer";
import { CloudflareWorkerCosts } from "./CloudflareWorkerCosts";

type OverviewResponse = {
  success: boolean;
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    owner: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    lastDeployedAt: string | null;
  };
  repository: {
    id: string;
    owner: string;
    name: string;
    fullName: string;
    url: string | null;
    description: string | null;
    infrastructure: string | null;
    defaultBranch: string;
  };
  tags: string[];
  codebase: {
    defaultBranch: string;
    entries: any[];
  };
  pendingPrs: any[];
  recentActivity: any[];
  cloudflare: {
    detected: boolean;
    workerName?: string;
    wranglerFile?: string | null;
    bindings?: Record<string, string[] | null>;
    deployments?: Array<{
      id: string;
      createdAt: string;
      source: string;
    }>;
    dashboardUrl?: string;
  };
};

interface CloudflareSdkDashboardProps {
  projectId: string;
  projectName: string;
  repoOwner: string;
  repoName: string;
  overview: OverviewResponse;
}

export function CloudflareSdkDashboard({ 
  projectId, 
  projectName, 
  repoOwner, 
  repoName, 
  overview 
}: CloudflareSdkDashboardProps) {

  // Default to false early check
  if (!overview.cloudflare.detected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Cloudflare Runtime
          </CardTitle>
          <CardDescription>No Cloudflare Worker configuration detected from repository analysis.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[calc(100vh-12rem)] min-h-[600px] overflow-hidden">
      <CardHeader className="border-b bg-muted/20 pb-4 shrink-0">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Cloud className="h-5 w-5 text-[#F38020]" />
              {overview.cloudflare.workerName || "Unknown Worker"}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="bg-[#F38020]/10 text-[#F38020] border-[#F38020]/20">
                Production
              </Badge>
              {overview.cloudflare.wranglerFile && (
                <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {overview.cloudflare.wranglerFile}
                </span>
              )}
            </CardDescription>
          </div>
          {overview.cloudflare.dashboardUrl && (
            <a
              href={overview.cloudflare.dashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-blue-400 hover:underline hover:text-blue-300"
            >
              Cloudflare Dashboard ↗
            </a>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
        <Tabs defaultValue="overview" className="h-full flex flex-col">
          <div className="border-b px-4">
            <TabsList className="bg-transparent gap-2 h-14 pb-0 items-end">
              <TabsTrigger 
                value="overview" 
                className="data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 pb-2 pt-2 -mb-[1px]"
              >
                <Cloud className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger 
                value="deployments" 
                className="data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 pb-2 pt-2 -mb-[1px]"
              >
                <GitMerge className="h-4 w-4 mr-2" />
                Deployments
              </TabsTrigger>
              <TabsTrigger 
                value="bindings" 
                className="data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 pb-2 pt-2 -mb-[1px]"
              >
                <FileCode2 className="h-4 w-4 mr-2" />
                Bindings
              </TabsTrigger>
              <TabsTrigger 
                value="logs" 
                className="data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 pb-2 pt-2 -mb-[1px]"
              >
                <Terminal className="h-4 w-4 mr-2" />
                Logs
              </TabsTrigger>
              <TabsTrigger 
                value="costs" 
                className="data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 pb-2 pt-2 -mb-[1px]"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Costs
              </TabsTrigger>
              <TabsTrigger 
                value="settings" 
                className="data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-4 pb-2 pt-2 -mb-[1px]"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="overview" className="m-0 mt-0 h-full">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-4">Worker Bindings Overview</h3>
                  {overview.cloudflare.bindings ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.entries(overview.cloudflare.bindings).map(([group, bindings]) => {
                        const list = (bindings as string[] || []).filter(Boolean);
                        if (!list.length) return null;
                        return (
                          <Card key={group} className="bg-muted/30">
                            <CardHeader className="pb-2 pt-4 px-4">
                              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                                {group}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-4">
                              <div className="flex flex-wrap gap-2">
                                {list.map((binding) => (
                                  <Badge key={`${group}-${binding}`} variant="secondary" className="font-mono text-xs font-normal">
                                    {binding}
                                  </Badge>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No bindings detected.</p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="deployments" className="m-0 mt-0 h-full">
               <div className="space-y-4">
                 <h3 className="text-lg font-medium">Deployment History</h3>
                 <DeploymentsList projectId={projectId} deployments={overview.cloudflare.deployments} />
               </div>
            </TabsContent>

            <TabsContent value="bindings" className="m-0 mt-0 h-full">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Resource Bindings</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Manage external resources like KV, D1, and standard environment variables hooked into this Worker.
                </p>
                <BindingsTable projectId={projectId} bindings={overview.cloudflare.bindings} />
              </div>
            </TabsContent>

            <TabsContent value="logs" className="m-0 mt-0 h-full">
               <LogStreamer projectId={projectId} />
            </TabsContent>

            <TabsContent value="costs" className="m-0 mt-0 h-full">
              {overview.cloudflare.workerName ? (
                <CloudflareWorkerCosts workerName={overview.cloudflare.workerName} />
              ) : (
                 <p className="text-sm text-muted-foreground">Worker name required to view costs.</p>
              )}
            </TabsContent>
            
            <TabsContent value="settings" className="m-0 mt-0 h-full">
               <div className="flex items-center justify-center h-40 text-muted-foreground">
                 Settings coming soon...
               </div>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
