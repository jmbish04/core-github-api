import React from "react";
import { KanbanBoard } from "@/components/learning/KanbanBoard";
import { UpscaleButton } from "@/components/learning/UpscaleButton";
import { useParams } from "react-router-dom";

export default function RepoInsights() {
  const { owner, repo } = useParams();
  const repoPath = `${owner}/${repo}`;
  const { data: insights } = useLearningApi(`/api/repos/${repoPath}/agents/learning/insights`);

  return (
    <div className="p-8 bg-zinc-950 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50">{repo} Architectural Health</h1>
          <p className="text-zinc-400">Pre-filtered immunization for this workspace.</p>
        </div>
        <UpscaleButton repo={repoPath} />
      </div>
      
      <KanbanBoard 
        data={insights} 
        onAction={(id) => handleLocalPatch(id)} 
        actionLabel="Patch Repository"
      />
    </div>
  );
}
