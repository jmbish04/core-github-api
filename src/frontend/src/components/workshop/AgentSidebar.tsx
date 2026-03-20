import { useState, useEffect } from "react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";

export interface SpecialistAgent {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  status: "online" | "busy" | "offline";
}

export function AgentSidebar({ 
  activeAgent, 
  onSelectAgent 
}: { 
  activeAgent: string, 
  onSelectAgent: (id: string) => void 
}) {
  const [agents, setAgents] = useState<SpecialistAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchAgents = async () => {
      try {
        const res = await api.frontend.workshop.specialists.$get();
        if (res.ok && mounted) {
          const data = await res.json();
          // Map properties, as the new backend provides 'description' instead of 'subtitle', and lacks 'status'
          const mappedAgents = data.map((a: any) => ({
            id: a.id,
            name: a.name,
            subtitle: a.description,
            icon: a.icon,
            status: "online" as const
          }));
          setAgents(mappedAgents);
        }
      } catch (err) {
        console.error("Failed to fetch specialist agents", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchAgents();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="w-[240px] bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
      
      {/* Header */}
      <div className="h-14 border-b border-zinc-800 flex items-center gap-3 px-5 shrink-0 bg-zinc-900/50">
        <div className="w-7 h-7 rounded-md bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
          <LucideIcons.Wrench className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <h1 className="font-semibold text-sm tracking-tight text-zinc-100">Agent Workshop</h1>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-3 mb-2 flex justify-between items-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-2">Specialist Agents</p>
          {loading && <LucideIcons.Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
        </div>

        <div className="space-y-0.5 px-3">
          {agents.map((agent) => {
            const isActive = activeAgent === agent.id;
            // Map the string icon name to the actual Lucide component
            const IconComponent = (LucideIcons as any)[agent.icon] || LucideIcons.Bot;
            
            return (
              <button
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group",
                  isActive 
                    ? "bg-indigo-500/10 hover:bg-indigo-500/15" 
                    : "hover:bg-zinc-800/50"
                )}
              >
                {/* Status Dot */}
                <div className="relative flex items-center justify-center shrink-0">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    agent.status === 'online' ? "bg-emerald-500" :
                    agent.status === 'busy' ? "bg-amber-500" : "bg-zinc-700"
                  )} />
                  {agent.status === 'online' && (
                    <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-20" />
                  )}
                </div>

                {/* Icon */}
                <IconComponent className={cn(
                  "w-4 h-4 shrink-0",
                  isActive ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-400"
                )} />

                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium truncate",
                    isActive ? "text-indigo-400" : "text-zinc-300 group-hover:text-zinc-200"
                  )}>
                    {agent.name}
                  </p>
                  <p className={cn(
                    "text-[10px] truncate leading-tight mt-0.5",
                    isActive ? "text-indigo-400/70" : "text-zinc-500"
                  )}>
                    {agent.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Badge */}
      <div className="p-4 border-t border-zinc-800 shrink-0">
        <div className="flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-950/50 border border-zinc-800 text-[10px] font-mono text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
          v5 migration active
        </div>
      </div>
      
    </div>
  );
}
