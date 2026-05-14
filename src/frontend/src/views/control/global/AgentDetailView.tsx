import { useMemo } from "react";
import { ArrowLeft, Server, Activity, ShieldAlert, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AgentStatusType } from "@/hooks/useAgentStatus";
import type { SpecialistAgent } from "@/hooks/useAgentSpecialists";
import { useGuardrailEvaluations } from "@/hooks/useGuardrailEvaluations";

interface AgentDetailViewProps {
  agent: SpecialistAgent;
  instances: AgentStatusType[];
  onBack: () => void;
}

export function AgentDetailView({ agent, instances, onBack }: AgentDetailViewProps) {
  const { data: evals, isLoading: evalsLoading } = useGuardrailEvaluations(100);

  // Filter guardrail evaluations relevant to this agent class instances
  const relevantEvals = useMemo(() => {
    if (!evals) return [];
    // If agent is GuardrailAgent, all are relevant. But for others, the evaluation is on their output.
    // However, the `agentId` in evaluations is the DO ID of the agent being evaluated.
    const instanceIds = new Set(instances.map(i => i.agentId));
    return evals.filter(e => instanceIds.has(e.agentId));
  }, [evals, instances]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            {agent.name} Details
          </h2>
          <p className="text-sm text-muted-foreground">{agent.subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Instances Panel */}
        <Card className="bg-card shadow-sm border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="w-4 h-4 text-blue-400" />
              Active Instances ({instances.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {instances.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No active instances.</p>
            ) : (
              instances.map(inst => {
                let state: any = {};
                try {
                  state = JSON.parse(inst.stateJson);
                } catch {
                  // Do nothing
                }
                
                return (
                  <div key={inst.agentId} className="flex flex-col gap-1 p-3 rounded-lg border bg-muted/20">
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-xs font-semibold">{inst.agentId}</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] h-5 px-1.5">
                        {state.status ? state.status.replace(/_/g, ' ') : "online"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      Last updated: {new Date(inst.updatedAt).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Traceability Panel */}
        <Card className="bg-card shadow-sm border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4 text-emerald-400" />
              Traceability Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {evalsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading logs...</p>
            ) : relevantEvals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No recent evaluations for these instances.</p>
            ) : (
              <div className="space-y-3">
                {relevantEvals.slice(0, 10).map(ev => (
                  <div key={ev.requestId} className="flex flex-col gap-1 p-3 rounded-lg border bg-muted/20">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-xs">{ev.agentId.slice(0, 8)}...</span>
                      {ev.status === 'pass' ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 h-5 px-1.5">Pass</Badge>
                      ) : ev.status === 'fail' ? (
                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 h-5 px-1.5">Fail</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 h-5 px-1.5">{ev.status}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <ShieldAlert className="w-3 h-3" />
                      Score: {ev.score} | {new Date(ev.evaluatedAt).toLocaleTimeString()}
                    </div>
                    {ev.issuesJson && ev.issuesJson !== "[]" && (
                      <div className="text-[10px] text-red-400 mt-1 bg-red-500/5 p-1 rounded font-mono">
                        {ev.issuesJson}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
