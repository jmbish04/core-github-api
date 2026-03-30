import React from "react";
import { KanbanBoard } from "@/components/learning/KanbanBoard";
import { useLearningApi } from "@/hooks/use-learning-api";
import { toast } from "@/hooks/use-toast";

export default function GlobalInsights() {
  const { data: insights, isLoading, error } = useLearningApi("/api/agents/learning/insights");

  const handleImmunize = async (insightId: number) => {
    // Action: Propose PR to core-github-standardization
    toast({ title: "Immunizing Fleet", description: "Generating PR for core-github-standardization..." });
  };

  if (error) return <ErrorDisplay error={error} />;

  return (
    <div className="p-8 bg-zinc-950 min-h-screen">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-50">Fleet Architectural Memory</h1>
        <p className="text-zinc-400">Manage patterns affecting all repositories.</p>
      </header>
      <KanbanBoard 
        data={insights} 
        onAction={handleImmunize} 
        actionLabel="Update Global Templates"
      />
    </div>
  );
}
