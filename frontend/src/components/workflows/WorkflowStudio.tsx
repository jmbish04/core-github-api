import { useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { FiCpu } from "react-icons/fi";
import { ArrowRight, GitBranch, PlayCircle, Route, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Flow from "@/components/workflows/Flow";
import type { TurboNodeData } from "@/components/workflows/TurboNode";
import { WorkflowRunsTab } from "@/components/workflows/WorkflowRunsTab";
import { AssistantSidebar } from "@/components/assistant-ui/assistant-sidebar";
import type { WorkflowMutation } from "@/components/assistant-ui/workflow-thread";
import type { WorkflowDefinition } from "@/components/workflows/catalog";

type WorkflowStudioProps = {
  workflow: WorkflowDefinition;
  mode: "new" | "edit";
};

function cloneNodes(nodes: Node<TurboNodeData>[]): Node<TurboNodeData>[] {
  return nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: { ...node.data },
  }));
}

function cloneEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({ ...edge }));
}

type NodeInsight = {
  id: string;
  title: string;
  subtitle: string;
  role: string;
  incoming: number;
  outgoing: number;
  behavior: "entry" | "exit" | "fan-out" | "fan-in" | "linear";
  nextTitles: string[];
};

function inferNodeRole(node: Node<TurboNodeData>): string {
  const text = `${node.data.title} ${node.data.subtitle || ""}`.toLowerCase();

  if (
    text.includes("trigger") ||
    text.includes("webhook") ||
    text.includes("push") ||
    text.includes("request") ||
    text.includes("issue") ||
    text.includes("comment")
  ) {
    return "Trigger";
  }
  if (
    text.includes("agent") ||
    text.includes("planner") ||
    text.includes("orchestrator") ||
    text.includes("classifier") ||
    text.includes("summarizer") ||
    text.includes("resolver") ||
    text.includes("assistant")
  ) {
    return "AI Decision";
  }
  if (
    text.includes("github") ||
    text.includes("api") ||
    text.includes("workflow") ||
    text.includes("deploy") ||
    text.includes("release") ||
    text.includes("store") ||
    text.includes("build") ||
    text.includes("notify") ||
    text.includes("post")
  ) {
    return "Execution";
  }
  if (text.includes("viewer") || text.includes("frontend") || text.includes("chat")) {
    return "User Surface";
  }
  return "Processing";
}

function buildNodeInsights(
  nodes: Node<TurboNodeData>[],
  edges: Edge[],
): NodeInsight[] {
  const incomingMap = new Map<string, Edge[]>();
  const outgoingMap = new Map<string, Edge[]>();

  for (const edge of edges) {
    const incoming = incomingMap.get(edge.target) || [];
    incoming.push(edge);
    incomingMap.set(edge.target, incoming);

    const outgoing = outgoingMap.get(edge.source) || [];
    outgoing.push(edge);
    outgoingMap.set(edge.source, outgoing);
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    const incoming = incomingMap.get(node.id)?.length || 0;
    const outgoingEdges = outgoingMap.get(node.id) || [];
    const outgoing = outgoingEdges.length;
    const nextTitles = outgoingEdges
      .map((edge) => nodeById.get(edge.target)?.data.title || edge.target)
      .slice(0, 4);

    let behavior: NodeInsight["behavior"] = "linear";
    if (incoming === 0) behavior = "entry";
    else if (outgoing === 0) behavior = "exit";
    else if (outgoing > 1) behavior = "fan-out";
    else if (incoming > 1) behavior = "fan-in";

    return {
      id: node.id,
      title: node.data.title,
      subtitle: node.data.subtitle || "No subtitle",
      role: inferNodeRole(node),
      incoming,
      outgoing,
      behavior,
      nextTitles,
    };
  });
}

function buildNarrative(insights: NodeInsight[]): string[] {
  return insights.map((insight, index) => {
    const next =
      insight.nextTitles.length > 0
        ? `Next: ${insight.nextTitles.join(", ")}.`
        : "This is a terminal step.";

    return `Step ${index + 1}: ${insight.title} (${insight.role}) handles ${
      insight.subtitle
    }. ${next}`;
  });
}

export function WorkflowStudio({ workflow, mode }: WorkflowStudioProps) {
  const [nodes, setNodes] = useState<Node<TurboNodeData>[]>(() =>
    cloneNodes(workflow.graph.nodes),
  );
  const [edges, setEdges] = useState<Edge[]>(() => cloneEdges(workflow.graph.edges));
  const [activeTab, setActiveTab] = useState<"overview" | "diagram" | "runs">("overview");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    workflow.graph.nodes[0]?.id || null,
  );

  useEffect(() => {
    setNodes(cloneNodes(workflow.graph.nodes));
    setEdges(cloneEdges(workflow.graph.edges));
    setSelectedNodeId(workflow.graph.nodes[0]?.id || null);
    setActiveTab("overview");
  }, [workflow]);

  const triggerBadges = useMemo(
    () => workflow.triggers.map((trigger) => <Badge key={`${workflow.key}-${trigger}`}>{trigger}</Badge>),
    [workflow],
  );

  const applyMutation = (mutation: WorkflowMutation) => {
    setNodes((previousNodes) => {
      const anchorNode =
        [...previousNodes].sort((a, b) => b.position.x - a.position.x)[0] || previousNodes[0];
      const sourceId = anchorNode?.id;
      const newNodeId = `node-${Date.now()}`;
      const nextNode: Node<TurboNodeData> = {
        id: newNodeId,
        type: "turbo",
        position: {
          x: (anchorNode?.position.x || 40) + 260,
          y: anchorNode?.position.y || 140,
        },
        data: {
          title: mutation.title,
          subtitle: mutation.subtitle,
          icon: <FiCpu />,
          color: mutation.color || "blue",
        },
      };

      setEdges((previousEdges) => {
        if (!sourceId) return previousEdges;
        return [
          ...previousEdges,
          {
            id: `edge-${sourceId}-${newNodeId}-${Date.now()}`,
            source: sourceId,
            target: newNodeId,
            animated: true,
          },
        ];
      });

      setSelectedNodeId(newNodeId);
      return [...previousNodes, nextNode];
    });
  };

  const insights = useMemo(() => buildNodeInsights(nodes, edges), [nodes, edges]);
  const selectedInsight = useMemo(
    () => insights.find((node) => node.id === selectedNodeId) || insights[0],
    [insights, selectedNodeId],
  );
  const narrative = useMemo(() => buildNarrative(insights), [insights]);
  const entryNodes = useMemo(
    () => insights.filter((node) => node.behavior === "entry"),
    [insights],
  );
  const fanOutNodes = useMemo(
    () => insights.filter((node) => node.behavior === "fan-out"),
    [insights],
  );

  const sendToJules = async (payload: {
    optimizedPrompt: string;
    transcript: Array<{ id: string; role: "assistant" | "user"; content: string }>;
  }): Promise<{ ok: boolean; message: string }> => {
    const response = await fetch("/api/workflows/jules", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        targetRepo: "jmbish04/core-github-api",
        workflowKey: workflow.key,
        workflowTitle: workflow.title,
        mode,
        optimizedPrompt: payload.optimizedPrompt,
        transcript: payload.transcript,
        canvas: {
          nodes: nodes.map((node) => ({
            id: node.id,
            title: node.data.title,
            subtitle: node.data.subtitle || "",
            position: node.position,
          })),
          edges: edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
          })),
        },
      }),
    });

    const json = await response.json().catch(() => ({} as Record<string, any>));

    if (!response.ok) {
      return {
        ok: false,
        message:
          json?.error || `Jules handoff failed with status ${response.status}.`,
      };
    }

    return {
      ok: true,
      message:
        json?.message ||
        "Workflow task prepared for Jules and ready for execution.",
    };
  };

  const resetCanvas = () => {
    setNodes(cloneNodes(workflow.graph.nodes));
    setEdges(cloneEdges(workflow.graph.edges));
  };

  return (
    <div className="mx-auto h-[calc(100vh-8rem)] max-w-[95rem]">
      <AssistantSidebar
        workflowKey={workflow.key}
        workflowTitle={workflow.title}
        mode={mode}
        onApplyMutation={applyMutation}
        onSendToJules={sendToJules}
      >
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">{workflow.title}</h1>
                <p className="text-sm text-muted-foreground">{workflow.description}</p>
              </div>
              <Button variant="outline" onClick={resetCanvas}>
                Reset Canvas
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">{triggerBadges}</div>
            <p className="text-sm text-muted-foreground">{workflow.automationDescription}</p>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab((value as "overview" | "diagram" | "runs") || "overview")}
            className="min-h-0 flex-1"
          >
            <TabsList className="grid w-full max-w-lg grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="runs">Runs</TabsTrigger>
              <TabsTrigger value="diagram">Diagram</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 min-h-0 flex-1">
              <div className="grid gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-1">
                  <CardHeader className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Route className="h-4 w-4" />
                      Runtime Summary
                    </CardTitle>
                    <CardDescription>How this workflow behaves during execution.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span className="text-muted-foreground">Nodes</span>
                      <span className="font-medium">{nodes.length}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span className="text-muted-foreground">Transitions</span>
                      <span className="font-medium">{edges.length}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span className="text-muted-foreground">Entry Points</span>
                      <span className="font-medium">{entryNodes.length}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span className="text-muted-foreground">Fan-out Stages</span>
                      <span className="font-medium">{fanOutNodes.length}</span>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                        <GitBranch className="h-3.5 w-3.5" />
                        Triggered By
                      </div>
                      <div className="flex flex-wrap gap-1.5">{triggerBadges}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="xl:col-span-1">
                  <CardHeader className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <PlayCircle className="h-4 w-4" />
                      Selected Node
                    </CardTitle>
                    <CardDescription>Click any canvas node in Diagram tab to inspect behavior.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {selectedInsight ? (
                      <>
                        <div className="rounded-md border px-3 py-2">
                          <div className="font-semibold">{selectedInsight.title}</div>
                          <div className="text-xs text-muted-foreground">{selectedInsight.subtitle}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{selectedInsight.role}</Badge>
                          <Badge variant="outline">{selectedInsight.behavior}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-md border px-3 py-2">
                            <div className="text-xs text-muted-foreground">Inbound</div>
                            <div className="font-semibold">{selectedInsight.incoming}</div>
                          </div>
                          <div className="rounded-md border px-3 py-2">
                            <div className="text-xs text-muted-foreground">Outbound</div>
                            <div className="font-semibold">{selectedInsight.outgoing}</div>
                          </div>
                        </div>
                        <div className="rounded-md border px-3 py-2">
                          <div className="mb-1 text-xs text-muted-foreground">Next Actions</div>
                          {selectedInsight.nextTitles.length > 0 ? (
                            <div className="space-y-1">
                              {selectedInsight.nextTitles.map((title) => (
                                <div key={`${selectedInsight.id}-${title}`} className="flex items-center gap-1">
                                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>{title}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No downstream action (terminal node).</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-muted-foreground">No node selected.</div>
                    )}
                  </CardContent>
                </Card>

                <Card className="xl:col-span-1">
                  <CardHeader className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Timer className="h-4 w-4" />
                      Execution Narrative
                    </CardTitle>
                    <CardDescription>What happens as this workflow progresses.</CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-[560px] space-y-2 overflow-y-auto text-sm">
                    {narrative.slice(0, 12).map((line) => (
                      <div key={line} className="rounded-md border px-3 py-2 text-muted-foreground">
                        {line}
                      </div>
                    ))}
                    {narrative.length > 12 ? (
                      <div className="text-xs text-muted-foreground">
                        +{narrative.length - 12} additional steps on canvas
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="diagram" className="mt-4 min-h-0 flex-1">
              <Flow
                initialNodes={nodes}
                initialEdges={edges}
                selectedNodeId={selectedNodeId || undefined}
                onNodeSelect={(node) => setSelectedNodeId(node.id)}
              />
            </TabsContent>
            
            <TabsContent value="runs" className="mt-4 min-h-0 flex-1">
                <WorkflowRunsTab workflow={workflow} />
            </TabsContent>
          </Tabs>
        </div>
      </AssistantSidebar>
    </div>
  );
}
