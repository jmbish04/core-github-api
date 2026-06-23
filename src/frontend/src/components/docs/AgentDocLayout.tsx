/**
 * @file src/frontend/src/components/docs/AgentDocLayout.tsx
 * @description Unified agent documentation layout component.
 * Routes between the agents index page and individual agent doc pages.
 * Agent data is fetched from /api/docs/agents (D1-backed) via useAgentsRegistry.
 */
import { useAgentsRegistry } from '@/hooks/useAgentsRegistry';
import { UxDesignAgentDoc } from './UxDesignAgentDoc';
import { SoftwareOrchestrationDoc } from './SoftwareOrchestrationDoc';
import {
  Sparkles, Shield, Wrench, BookOpen, Users, Code2, Cpu,
  ArrowLeft, ExternalLink, Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { LucideIcon } from 'lucide-react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Icon name → component mapping ─────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Sparkles, Shield, Wrench, BookOpen, Users, Code2, Cpu
};

function AgentIcon({ name, color }: { name: string; color: string }) {
  const Icon = ICON_MAP[name] ?? Sparkles;
  return <Icon className={`w-5 h-5 ${color}`} />;
}

// ─── Component ───────────────────────────────────────────────────────────────

const queryClient = new QueryClient();

interface AgentDocLayoutProps {
  page: 'index' | 'ux-design-agent' | 'software-orchestration';
}

export function AgentDocLayout({ page }: AgentDocLayoutProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AgentDocLayoutInner page={page} />
    </QueryClientProvider>
  );
}

function AgentDocLayoutInner({ page }: AgentDocLayoutProps) {
  const { agents, loading, error } = useAgentsRegistry();

  if (page === 'ux-design-agent') {
    return (
      <div className="min-h-screen bg-zinc-950">
        <nav className="border-b border-zinc-800 px-6 py-3 flex items-center gap-3">
          <a href="/docs/agents" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            All Agents
          </a>
          <span className="text-zinc-700">/</span>
          <span className="text-xs text-zinc-300">UX Design Agent</span>
          <a href="/workshop" className="ml-auto flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300">
            Open Workshop <ExternalLink className="w-3 h-3" />
          </a>
        </nav>
        <UxDesignAgentDoc />
      </div>
    );
  }

  if (page === 'software-orchestration') {
    return (
      <div className="min-h-screen bg-zinc-950">
        <nav className="border-b border-zinc-800 px-6 py-3 flex items-center gap-3">
          <a href="/docs/agents" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            All Agents
          </a>
          <span className="text-zinc-700">/</span>
          <span className="text-xs text-zinc-300">Software Orchestrator</span>
          <a href="/control/global/planning-rooms" className="ml-auto flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
            View Active Rooms <ExternalLink className="w-3 h-3" />
          </a>
        </nav>
        <SoftwareOrchestrationDoc />
      </div>
    );
  }

  // ── Index: fetch agents from D1 API ────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-red-400">Failed to load agents: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 max-w-4xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-100 mb-2">Colony Agents</h1>
        <p className="text-zinc-400 text-sm max-w-2xl">
          Colony is powered by a fleet of specialized AI agents. Each agent has a dedicated purpose,
          a set of skills, and a Cloudflare Durable Object runtime. Click any agent to view full documentation.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {agents.map((agent) => (
          <a
            key={agent.id}
            href={`/docs/agents/${agent.docsSlug ?? agent.id}`}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-700 transition-all group block"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg ${agent.iconBg} flex items-center justify-center shrink-0`}>
                <AgentIcon name={agent.iconName} color={agent.iconColor} />
              </div>
              <div>
                <h2 className="font-semibold text-zinc-100 text-sm group-hover:text-white transition-colors">
                  {agent.name}
                </h2>
                <div className="flex flex-wrap gap-1 mt-1">
                  {agent.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[9px] py-0 px-1.5 border-zinc-700 text-zinc-500">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">{agent.description}</p>
            <div className="mt-3 flex items-center gap-1 text-[11px] text-zinc-600 group-hover:text-indigo-400 transition-colors">
              View docs <ExternalLink className="w-3 h-3" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
