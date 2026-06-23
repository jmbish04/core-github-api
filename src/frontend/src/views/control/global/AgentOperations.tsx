import { useAgentStatus } from '@/hooks/useAgentStatus';
import ChatRoomsList from './ChatRoomsList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Activity, ShieldCheck, Box, Server } from 'lucide-react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';

export default function AgentOperations() {
  const { data: statuses, isLoading } = useAgentStatus();

  return (
    <SidebarProvider>
      <SidebarInset className="relative flex-1 flex flex-col min-w-0 bg-background overflow-y-auto">
        <header className="px-6 py-4 border-b flex flex-col gap-2 bg-background/30 backdrop-blur shrink-0">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Server className="w-5 h-5 text-emerald-500" />
            Agent Operations Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">Monitor real-time agent health, status, and system workflows.</p>
        </header>

        <main className="flex-1 p-6 space-y-8">
          {/* Agent Status Grid */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Live Agent Status
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {isLoading ? (
                <div className="col-span-full flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : statuses?.length === 0 ? (
                <div className="col-span-full p-4 text-center text-sm text-muted-foreground border rounded-lg bg-muted/20">
                  No active agent states recorded.
                </div>
              ) : (
                statuses?.map((status) => {
                  let parsedState: any = {};
                  try {
                    parsedState = JSON.parse(status.stateJson);
                  } catch (e) {}

                  return (
                    <Card key={status.id} className="bg-card shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium">{status.agentType}</CardTitle>
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                            Online
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate" title={status.agentId}>
                          {status.agentId}
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-xs">
                          <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Last Update:</span>
                          <p className="font-mono mt-0.5">{new Date(status.updatedAt).toLocaleTimeString()}</p>
                        </div>
                        {parsedState.status && (
                          <div className="text-xs">
                            <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Internal Status:</span>
                            <p className="mt-0.5 capitalize">{parsedState.status.replace(/_/g, ' ')}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </section>

          {/* Active Chat Rooms (formerly Planning Rooms) */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Box className="w-4 h-4 text-purple-400" />
              Active Chat Rooms
            </h2>
            <ChatRoomsList />
          </section>

          {/* Workflow Monitor Skeleton (future hookup) */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              System Workflows & Health
            </h2>
            <Card className="bg-card shadow-sm border-dashed">
              <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-2">
                <ShieldCheck className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Workflow execution logs and health bounds will be detailed here.</p>
              </CardContent>
            </Card>
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
