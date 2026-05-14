import { useState } from 'react';
import { useAgentStatus } from '@/hooks/useAgentStatus';
import { useAgentSpecialists, type SpecialistAgent } from '@/hooks/useAgentSpecialists';
import { AgentDetailView } from './AgentDetailView';
import ChatRoomsList from './ChatRoomsList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Activity, ShieldCheck, Box, Server, Bot, Code, Search, Wrench, ChevronRight } from 'lucide-react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';

const IconMap: Record<string, any> = {
  Bot: Bot,
  Code: Code,
  Search: Search,
  Wrench: Wrench
};

export default function AgentOperations() {
  const { data: statuses } = useAgentStatus();
  const { data: specialists, isLoading: specialistsLoading } = useAgentSpecialists();
  
  const [selectedAgent, setSelectedAgent] = useState<SpecialistAgent | null>(null);

  const getInstancesForAgent = (agentId: string) => {
    if (!statuses) return [];
    return statuses.filter(s => s.agentType === agentId);
  };

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
          {selectedAgent ? (
            <AgentDetailView 
              agent={selectedAgent} 
              instances={getInstancesForAgent(selectedAgent.id)}
              onBack={() => setSelectedAgent(null)}
            />
          ) : (
            <>
              {/* Agent Status Grid */}
              <section className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  Specialist Agents
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {specialistsLoading ? (
                    <div className="col-span-full flex items-center justify-center p-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : specialists?.length === 0 ? (
                    <div className="col-span-full p-4 text-center text-sm text-muted-foreground border rounded-lg bg-muted/20">
                      No specialist agents found.
                    </div>
                  ) : (
                    specialists?.map((agent) => {
                      const instances = getInstancesForAgent(agent.id);
                      const Icon = IconMap[agent.icon] || Server;

                      return (
                        <Card 
                          key={agent.id} 
                          className="bg-card shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors group"
                          onClick={() => setSelectedAgent(agent)}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-md bg-muted text-muted-foreground group-hover:text-emerald-400 group-hover:bg-emerald-500/10 transition-colors">
                                  <Icon className="w-4 h-4" />
                                </div>
                                <CardTitle className="text-sm font-medium">{agent.name}</CardTitle>
                              </div>
                              <Badge variant="outline" className={`px-1.5 h-5 text-[10px] uppercase ${agent.status === 'online' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-muted text-muted-foreground'}`}>
                                {agent.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate pt-1">
                              {agent.subtitle}
                            </p>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center justify-between mt-2 pt-3 border-t">
                              <div className="flex items-center gap-1.5 text-xs">
                                <Activity className={`w-3.5 h-3.5 ${instances.length > 0 ? 'text-blue-400' : 'text-muted-foreground/50'}`} />
                                <span className={instances.length > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                                  {instances.length} Active Session{instances.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-emerald-400 transition-colors" />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Active Chat Rooms */}
              <section className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Box className="w-4 h-4 text-purple-400" />
                  Active Chat Rooms
                </h2>
                <ChatRoomsList />
              </section>

              {/* Workflow Monitor Skeleton */}
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
            </>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
