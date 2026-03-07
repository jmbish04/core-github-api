import { useState } from "react";
import { api } from "@/lib/api-client";
import * as LucideIcons from "lucide-react";

export function ConsultationView({ 
  agentId, 
  projectId,
  onComplete 
}: { 
  agentId: string; 
  projectId: string;
  onComplete: () => void;
}) {
  const [repoName, setRepoName] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);

  const handleInit = async () => {
    if (!repoName) return;
    setIsDeploying(true);
    try {
      const res = await api.frontend.workshop.init.$post({
        json: {
          projectId,
          description: "Scaffolded via Workshop Agent",
          visibility: "private"
        }
      });
      if (res.ok) {
        onComplete();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* Left Pane: Chat (Placeholder for Assistant UI / AI Chat) */}
      <div className="w-1/2 border-r border-zinc-800 bg-zinc-950 flex flex-col p-6">
        <h2 className="text-lg font-medium text-zinc-200 mb-4 flex items-center gap-2">
          <LucideIcons.MessageSquare className="w-5 h-5 text-indigo-400" />
          Consultation with {agentId}
        </h2>
        
        <div className="flex-1 border border-zinc-800 rounded-lg bg-zinc-900/50 flex items-center justify-center p-8 text-center">
          <p className="text-zinc-500">
            Assistant UI / AI Chat integration goes here.<br/>
            (Connecting to WorkshopAgent DO WebSocket...)
          </p>
        </div>
      </div>

      {/* Right Pane: Context / PRD / Kanban preview */}
      <div className="w-1/2 bg-zinc-900/30 flex flex-col p-6">
        <h2 className="text-lg font-medium text-zinc-200 mb-4 flex items-center gap-2">
          <LucideIcons.FileText className="w-5 h-5 text-indigo-400" />
          Living Architecture
        </h2>
        
        <div className="flex-1 flex flex-col gap-6">
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900">
            <label className="block text-sm font-medium text-zinc-400 mb-2">Project Repository Name</label>
            <input 
              type="text" 
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="e.g. core-data-pipeline"
            />
          </div>

          <div className="mt-auto">
            <button
              disabled={isDeploying || !repoName}
              onClick={handleInit}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {isDeploying ? (
                <LucideIcons.Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LucideIcons.Rocket className="w-5 h-5" />
              )}
              {isDeploying ? "Deploying Team..." : "Initialize Project"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
