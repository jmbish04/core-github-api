import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Zap, 
  Activity, 
  Power, 
  Settings2, 
  ShieldCheck, 
  Search,
  FileCode2,
  GitPullRequest,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import axios from "axios";
import { toast } from "sonner";

// Types
type WebhookConfig = {
  automationClass: string;
  key: string;
  domain: "pr" | "issues" | "push" | "repository" | "security" | "telemetry";
  description: string;
  events: string[];
  authPolicy: "app" | "pat";
  alwaysOn: boolean;
  canToggle: boolean;
  isActive: boolean;
};

type AutomationLog = {
  id: string;
  repo: string;
  deliveryId: string | null;
  eventName: string | null;
  automationClass: string;
  status: "success" | "failure" | "skipped";
  message: string;
  contextId: string | null;
  createdAt: string;
};

export default function Workflows() {
  const queryClient = useQueryClient();
  const [searchLogs, setSearchLogs] = useState("");

  const { data: configsData } = useQuery({
    queryKey: ["webhook-configs"],
    queryFn: async () => {
      const res = await axios.get<{ configs: WebhookConfig[] }>("/api/ops/workflows/configs");
      return res.data.configs;
    }
  });

  const { data: logsData, isLoading: loadingLogs } = useQuery({
    queryKey: ["automation-logs"],
    queryFn: async () => {
      const res = await axios.get<{ logs: AutomationLog[] }>("/api/ops/workflows/logs");
      return res.data.logs;
    },
    refetchInterval: 5000 // auto refresh logs
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (config: WebhookConfig) => {
      await axios.post("/api/ops/workflows/configs", {
        automationClass: config.automationClass,
        isActive: config.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhook-configs"] });
      toast.success("Configuration updated successfully.");
    },
    onError: (err: Error) => {
      toast.error(`Failed to update config: ${err.message}`);
    }
  });

  const handleToggleActive = (config: WebhookConfig) => {
    if (!config.canToggle) {
      return;
    }

    updateConfigMutation.mutate({
      ...config,
      isActive: !config.isActive,
    });
  };

  const filteredLogs = (logsData || []).filter(log => 
    log.automationClass.toLowerCase().includes(searchLogs.toLowerCase()) || 
    log.message.toLowerCase().includes(searchLogs.toLowerCase()) ||
    (log.contextId && log.contextId.includes(searchLogs)) ||
    log.repo.toLowerCase().includes(searchLogs.toLowerCase()) ||
    (log.eventName && log.eventName.toLowerCase().includes(searchLogs.toLowerCase()))
  );

  // ------------- Agentic Chat State -------------
  const [chatMessages, setChatMessages] = useState<{ id: number, role: string, content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const handleSendPrompt = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput("");
    setChatMessages((prev) => [...prev, { id: Date.now(), role: "user", content: userMsg }]);
    setIsChatLoading(true);

    try {
      let threadId = activeThreadId;
      if (!threadId) {
        // Create new thread
        const createRes = await axios.post("/api/chat/threads", {
          subject: "Automation Architect Session",
          agentId: "automation-architect"
        });
        threadId = createRes.data.id;
        setActiveThreadId(threadId);
      }

      const res = await axios.post(`/api/chat/threads/${threadId}/messages`, {
        content: userMsg
      });

      if (res.data) {
        const agentMsg = res.data.find((m: { role: string; content: string }) => m.role === "agent");
        if (agentMsg) {
          setChatMessages((prev) => [
            ...prev,
            { id: Date.now() + 1, role: "agent", content: agentMsg.content }
          ]);
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      toast.error("Chat error: " + error.message);
    } finally {
      setIsChatLoading(false);
    }
  };
  // --------------------------------------------

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-zinc-800 py-4 px-6 flex items-center justify-between bg-zinc-900/50 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-4">
            <Settings2 className="w-6 h-6 text-indigo-400" />
            <h1 className="text-xl font-bold tracking-tight">Global Automations</h1>
            <Badge variant="outline" className="bg-indigo-950/40 text-indigo-300 border-indigo-800/40 font-mono text-[10px] ml-2">
              v2.0 Object-Oriented
            </Badge>
          </div>
          <div>
            <Button variant="outline" size="sm" className="gap-2">
              <FileCode2 className="w-4 h-4 text-emerald-400" />
              Generate Automation
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          <Tabs defaultValue="configs" className="space-y-6">
            <TabsList className="bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="configs" className="data-[state=active]:bg-zinc-800">
                <Power className="w-4 h-4 mr-2" /> Capabilities
              </TabsTrigger>
              <TabsTrigger value="logs" className="data-[state=active]:bg-zinc-800">
                <Activity className="w-4 h-4 mr-2" /> Execution Logs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="configs">
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {(configsData || []).map((config) => (
                  <Card key={config.automationClass} className={`bg-zinc-900/40 border-zinc-800/60 transition-all ${config.isActive ? 'border-indigo-800/50 shadow-[0_0_15px_rgba(79,70,229,0.05)]' : 'opacity-70 grayscale-[0.2]'}`}>
                    <CardHeader className="pb-3 border-b border-zinc-800/50">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 pr-4">
                          <CardTitle className="text-base font-semibold text-zinc-200">
                            {config.key}
                          </CardTitle>
                          <CardDescription className="text-xs text-zinc-500 font-mono">
                            {config.automationClass}
                          </CardDescription>
                        </div>
                        <Switch 
                          checked={config.isActive} 
                          disabled={!config.canToggle}
                          onCheckedChange={() => handleToggleActive(config)}
                          className={config.isActive ? 'data-[state=checked]:bg-indigo-500' : ''}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      <p className="text-sm text-zinc-400 leading-relaxed">{config.description}</p>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="bg-zinc-950/50 text-zinc-300 border-zinc-800 text-[10px] uppercase">
                          {config.domain}
                        </Badge>
                        {config.alwaysOn ? (
                          <Badge variant="outline" className="bg-indigo-950/40 text-indigo-300 border-indigo-800/40 text-[10px] uppercase">
                            Always On
                          </Badge>
                        ) : null}
                        {config.events.map((eventName) => (
                          <Badge key={`${config.automationClass}-${eventName}`} variant="outline" className="bg-zinc-950/50 text-zinc-400 border-zinc-800 text-[10px]">
                            <Workflow className="w-3 h-3 mr-1" />
                            {eventName}
                          </Badge>
                        ))}
                      </div>
                      
                      <div className="flex items-center justify-between text-sm bg-zinc-950/50 p-3 rounded-md border border-zinc-800/50">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className={`w-4 h-4 ${config.authPolicy === 'pat' ? 'text-amber-400' : 'text-emerald-400'}`} />
                          <span className="text-zinc-300 font-medium">Auth Identity</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${config.authPolicy === 'app' ? 'text-emerald-400 font-bold' : 'text-zinc-500'}`}>App</span>
                          <span className="text-zinc-600">/</span>
                          <span className={`text-xs ${config.authPolicy === 'pat' ? 'text-amber-400 font-bold' : 'text-zinc-500'}`}>PAT</span>
                        </div>
                      </div>

                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="logs">
              <Card className="bg-zinc-900/50 border-zinc-800 flex flex-col h-[calc(100vh-16rem)]">
                <CardHeader className="pb-3 border-b border-zinc-800">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Recent Executions</CardTitle>
                    <div className="relative w-64">
                      <Search className="absolute left-2 top-2 h-4 w-4 text-zinc-500" />
                      <Input 
                        placeholder="Search logs..." 
                        value={searchLogs}
                        onChange={e => setSearchLogs(e.target.value)}
                        className="pl-8 bg-zinc-950 border-zinc-700 h-8 text-xs"
                      />
                    </div>
                  </div>
                </CardHeader>
                <div className="flex-1 overflow-auto min-h-0">
                  <Table>
                    <TableHeader className="bg-zinc-950/50 sticky top-0 z-10">
                      <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                        <TableHead className="w-[180px] text-xs font-semibold">Timestamp</TableHead>
                        <TableHead className="text-xs font-semibold">Automation</TableHead>
                        <TableHead className="text-xs font-semibold">Status</TableHead>
                        <TableHead className="text-xs font-semibold">Context</TableHead>
                        <TableHead className="text-xs font-semibold">Event</TableHead>
                        <TableHead className="w-[400px] text-xs font-semibold">Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingLogs ? (
                         <TableRow>
                           <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                             Loading logs...
                           </TableCell>
                         </TableRow>
                      ) : filteredLogs.length === 0 ? (
                         <TableRow>
                           <TableCell colSpan={6} className="h-24 text-center text-zinc-500">
                             No execution logs found.
                           </TableCell>
                         </TableRow>
                      ) : (
                        filteredLogs.map(log => (
                          <TableRow key={log.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                            <TableCell className="text-xs text-zinc-400 font-mono">
                              {new Date(log.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell className="font-medium text-indigo-300 text-sm">
                              {log.automationClass}
                            </TableCell>
                            <TableCell>
                              {log.status === 'success' ? (
                                <Badge variant="outline" className="bg-emerald-950/30 text-emerald-400 border-emerald-800/50 text-[10px]">SUCCESS</Badge>
                              ) : log.status === 'skipped' ? (
                                <Badge variant="outline" className="bg-zinc-900 text-zinc-400 border-zinc-700 text-[10px]">SKIPPED</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-red-950/50 text-red-400 border-red-800/50 text-[10px]">FAILED</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-zinc-500">
                                {log.contextId || '-'}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-zinc-500">
                                {log.eventName || '-'}
                            </TableCell>
                            <TableCell className="text-xs text-zinc-300 truncate max-w-[400px]">
                                {log.message}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      
      {/* Agent UI Placeholder (Right sidebar) */}
      <div className="w-[450px] border-l border-zinc-800 bg-zinc-950 flex flex-col shrink-0">
        <header className="border-b border-zinc-800 p-4 bg-zinc-900/50">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" /> Automation Architect
          </h2>
          <p className="text-xs text-zinc-500 mt-1">Generate new domain classes directly to source control.</p>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-70">
              <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <GitPullRequest className="w-8 h-8 text-zinc-600" />
              </div>
              <div>
                <h3 className="text-zinc-300 font-medium">Ready to Scaffold</h3>
                <p className="text-zinc-500 text-xs mt-1 max-w-[250px]">
                  Describe the webhook automation you need. I will generate a BaseAutomation class and submit a PR.
                </p>
              </div>
            </div>
          ) : (
            chatMessages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-zinc-800 border-zinc-700' : 'bg-indigo-950 border-indigo-800'}`}>
                  <span className="text-xs font-bold">{msg.role === 'user' ? 'U' : 'AI'}</span>
                </div>
                <div className={`p-3 rounded-lg text-sm max-w-[85%] whitespace-pre-wrap ${msg.role === 'user' ? 'bg-zinc-800 text-zinc-200' : 'bg-indigo-950/30 text-zinc-300 border border-indigo-900/50'}`}>
                  {msg.content}
                </div>
              </div>
            ))
          )}
          {isChatLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-950 border border-indigo-800 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold animate-pulse">AI</span>
              </div>
              <div className="p-3 rounded-lg text-sm bg-indigo-950/30 text-zinc-400 border border-indigo-900/50 italic flex items-center gap-2">
                <Zap className="w-3 h-3 animate-pulse" /> Architecting automation...
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
          <Input 
            disabled={isChatLoading}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendPrompt();
            }}
            placeholder="e.g. Generate a Slack webhook alert for stars..."
            className="bg-zinc-950 border-zinc-700 focus-visible:ring-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}
