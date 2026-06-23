import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cpu, Github, ExternalLink, Workflow, MessageSquare } from 'lucide-react';

export function SoftwareOrchestrationDoc() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="flex items-start gap-5 mb-8 border-b border-zinc-800 pb-8">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)]">
          <Cpu className="w-8 h-8 text-blue-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 mb-2 tracking-tight">Software Orchestrator</h1>
          <p className="text-zinc-400 text-base max-w-2xl leading-relaxed">
            The Software Engineer Agent acts as a central orchestrator. It manages sessions over Jules, initiates parallel Cloudflare Docs research to ensure standard compliance, and interacts with users via multiparty WebSocket PlanningRooms.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="outline" className="bg-zinc-900/50 border-zinc-800 text-zinc-400 font-mono text-[10px]">
              Durable Object
            </Badge>
            <Badge variant="outline" className="bg-zinc-900/50 border-zinc-800 text-blue-400/80 font-mono text-[10px]">
              @cloudflare/agents
            </Badge>
            <Badge variant="outline" className="bg-zinc-900/50 border-zinc-800 text-blue-400/80 font-mono text-[10px]">
              Jules Integration
            </Badge>
            <Badge variant="outline" className="bg-zinc-900/50 border-zinc-800 text-blue-400/80 font-mono text-[10px]">
              Multi-Agent
            </Badge>
          </div>
        </div>
      </div>

      {/* Architecture */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-zinc-100 mb-4 flex items-center gap-2">
          <Workflow className="w-5 h-5 text-zinc-500" />
          Architecture & Flow
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-zinc-900/40 border-zinc-800/60 p-5">
            <h3 className="font-semibold text-zinc-200 mb-2">1. Planning Session Creation</h3>
            <p className="text-sm text-zinc-400 leading-relaxed mb-4">
              Triggered via <code className="text-xs bg-zinc-950 px-1 py-0.5 rounded border border-zinc-800 text-rose-300">POST /api/agent-planning/orchestrate</code>.
              The Orchestrator checks if a repository is linked to the requested project.
            </p>
            <ul className="text-xs text-zinc-500 space-y-2">
              <li>• Creates a <strong>PlanningRoom</strong> Durable Object instance.</li>
              <li>• Links the new chat space to the provided context.</li>
            </ul>
          </Card>
          
          <Card className="bg-zinc-900/40 border-zinc-800/60 p-5">
            <h3 className="font-semibold text-zinc-200 mb-2">2. Jules Dispatch & Parallel Docs</h3>
            <p className="text-sm text-zinc-400 leading-relaxed mb-4">
              Depending on target repo size, it spins up a stateful Jules session. Simultaneously, it tasks the Cloudflare Docs Agent to synthesize best practices for the prompt.
            </p>
            <ul className="text-xs text-zinc-500 space-y-2">
              <li>• <span className="text-blue-400">Repoless mode:</span> Pure logical plan generation.</li>
              <li>• <span className="text-emerald-400">Repo-aware mode:</span> Contextual exploration on GitHub.</li>
            </ul>
          </Card>
        </div>
      </section>

      {/* State Mirroring & Data */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-zinc-100 mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-zinc-500" />
          D1 Mirroring & Continuous Learning
        </h2>
        <Card className="bg-zinc-900/30 border-zinc-800/50 p-6">
          <p className="text-sm text-zinc-400 leading-relaxed mb-6">
            The <code>PlanningRoom</code> automatically intercepts Agent state events and mirrors them down to D1 (`planning_room_logs`). This ensures historical auditing is intact, enabling continuous learning pipelines.
          </p>
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 overflow-x-auto">
            <pre className="text-[11px] font-mono text-zinc-300 leading-relaxed">
{`// Example SQL mirroring schema abstraction
export const planningRoomLogs = sqliteTable('planning_room_logs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  type: text('type').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  createdAt: text('created_at').notNull()
});`}
            </pre>
          </div>
        </Card>
      </section>

      {/* Integration endpoints */}
      <section>
        <h2 className="text-xl font-semibold text-zinc-100 mb-4 flex items-center gap-2">
          <Github className="w-5 h-5 text-zinc-500" />
          API References
        </h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/20">
            <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[10px] w-14 justify-center">POST</Badge>
            <code className="text-sm font-mono text-zinc-300">/api/agent-planning/orchestrate</code>
            <span className="text-xs text-zinc-500 ml-auto hidden sm:block">Starts planning session</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/20">
            <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[10px] w-14 justify-center">POST</Badge>
            <code className="text-sm font-mono text-zinc-300">/api/agent-planning/execute</code>
            <span className="text-xs text-zinc-500 ml-auto hidden sm:block">Fires Implementation step</span>
          </div>
        </div>
      </section>
    </div>
  );
}
