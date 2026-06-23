/**
 * @file src/frontend/src/components/docs/ToolkitDoc.tsx
 * @description Frontend documentation page detailing the agentic toolkit capabilities.
 */
import React from 'react';
import {
  Wrench, Database, Github, Network, LayoutTemplate, Globe
} from 'lucide-react';

const sections = [
  {
    id: 'cloudflare',
    title: 'Cloudflare Tooling',
    icon: <Globe className="w-5 h-5 text-orange-400" />,
    description: 'Cloudflare-specific tooling and APIs used by agents for deep ecosystem integrations.',
    tools: [
      {
        name: 'Cloudflare Docs MCP',
        description: 'Model Context Protocol (MCP) tool that provides agents semantic search access to the entire Cloudflare developer documentations. Essential for looking up specific Workers features, limits, bindings configurations, and library usage.',
        usedBy: ['SoftwareEngineerAgent', 'StandardizationAgent', 'PlannerAgent']
      },
      {
        name: 'AI Gateway',
        description: 'Proxy routing and caching for all model invocations. Enforces standardized observability, manages fallbacks across providers (OpenAI, Anthropic, Google), and handles rate-limiting so that our sub-agents don\'t hammer upstream APIs.',
        usedBy: ['OrchestratorAgent', 'All AI Agents']
      },
      {
        name: 'Sandbox SDK (Browser)',
        description: 'Integration with Cloudflare Browser Rendering API. Agents can spawn headless browsers to visually inspect remote pages, test layouts, or extract DOM structures dynamically.',
        usedBy: ['UxResearcher', 'SoftwareEngineerAgent']
      }
    ]
  },
  {
    id: 'database',
    title: 'Database & Semantics',
    icon: <Database className="w-5 h-5 text-emerald-400" />,
    description: 'Tools for persistent state, semantic understanding, and D1 integrations.',
    tools: [
      {
        name: 'D1 Tooling (SQL)',
        description: 'Native tools allowing agents to query the D1 SQLite database, execute safe SELECTs to verify data structures, and in some restricted modes, apply generated table migrations safely.',
        usedBy: ['Supervisor', 'SoftwareEngineerAgent']
      },
      {
        name: 'Vectorize (Semantic Search)',
        description: 'Vector database operations using Cloudflare Vectorize. Agents use this to perform RAG-based searches on massive repositories, find relevant code snippets via embeddings, and contextualize knowledge.',
        usedBy: ['ResearchAgent', 'StandardizationAgent']
      },
      {
        name: 'D1 Webhooks',
        description: 'Event-driven database tooling that lets agents subscribe to specific row mutations (like new backlog stories) and trigger downstream agentic actions (like breaking down epics).',
        usedBy: ['PlannerAgent', 'Supervisor']
      }
    ]
  },
  {
    id: 'github',
    title: 'GitHub integrations',
    icon: <Github className="w-5 h-5 text-zinc-300" />,
    description: 'Capabilities related to code management, branch operations, and version control.',
    tools: [
      {
        name: 'Repository Scans',
        description: 'Agents can read the entire tree of a repository, fetch specific blobs by SHA, and list commits. This is the bedrock of code analysis and refactoring tasks.',
        usedBy: ['ResearchAgent', 'PrReviewer', 'SoftwareEngineerAgent']
      },
      {
        name: 'PR Creation & Management',
        description: 'Ability to automatically forge multi-parent reconciliation commits, stage diffs, build Pull Requests via the Git Data API, and assign PR reviewers.',
        usedBy: ['SoftwareEngineerAgent', 'Supervisor']
      },
      {
        name: 'Comment Extraction',
        description: 'Pulls PR comments and GitHub issues to synthesize actionable tasks, providing the agent a living backlog from existing repositories.',
        usedBy: ['PlannerAgent', 'OrchestratorAgent']
      }
    ]
  },
  {
    id: 'edgraph',
    title: 'Edgraph Memory Service',
    icon: <Network className="w-5 h-5 text-indigo-400" />,
    description: 'Partitioned memory operations (episodic, semantic, and graph) for stateful AI agents via Service Bindings.',
    tools: [
      {
        name: 'Episodic Memory',
        description: 'Event streams tracking conversational history across an agent\'s lifetime. Saves specific turns and interactions asynchronously without blocking standard LLM yields using `ctx.waitUntil`.',
        usedBy: ['ChatRoom', 'LearningAgent']
      },
      {
        name: 'Semantic Memory',
        description: 'Vectorized facts and user rules stored via semantic embeddings. Permits agents to recall core principles defined in previous sessions.',
        usedBy: ['LearningAgent', 'StandardizationAgent']
      },
      {
        name: 'Graph Memory',
        description: 'Manages entity relationships in a directed knowledge graph. Agents add directed edges to model source -> target relationships (e.g. USER -> OWNS -> REPO).',
        usedBy: ['TopicOrchestratorAgent', 'LearningAgent']
      }
    ]
  },
  {
    id: 'ui',
    title: 'UI Design & Stitch',
    icon: <LayoutTemplate className="w-5 h-5 text-fuchsia-400" />,
    description: 'Tools dedicated to visual synthesis and frontend component generation.',
    tools: [
      {
        name: 'Stitch Tool',
        description: 'Agentic tool that synthesizes full shadcn/ui components. Uses AST-based validation and converts semantic UI/UX requirements into functional React artifacts.',
        usedBy: ['UxResearcher', 'SoftwareEngineerAgent']
      },
      {
        name: 'Golden Path Standards',
        description: 'Configuration retrieval tool that injects AST compliance rules, naming conventions, and exact Tailwind/shadcn patterns required for this repository directly into the agent’s context.',
        usedBy: ['StandardizationAgent', 'SoftwareEngineerAgent']
      }
    ]
  }
];

export function ToolkitDoc() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3 sticky top-0 bg-zinc-950/80 backdrop-blur z-10">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-indigo-400" />
          <span className="text-zinc-100 font-semibold tracking-tight">Agentic Toolkit</span>
        </div>
        <div className="ml-auto text-xs text-zinc-500 flex gap-4">
          <a href="/docs/agents" className="hover:text-zinc-300 transition-colors">Agents</a>
          <a href="/workshop" className="hover:text-zinc-300 transition-colors">Workshop</a>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-zinc-800 bg-zinc-900/30 p-6 hidden md:block overflow-y-auto">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Categories</h3>
          <ul className="space-y-2">
            {sections.map(section => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-1.5 focus:outline-none">
                  {section.icon}
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-12 overflow-y-auto w-full">
          <div className="max-w-4xl mx-auto">
            <header className="mb-16">
              <h1 className="text-4xl font-bold tracking-tight text-zinc-100 mb-4">
                The Agentic Toolkit
              </h1>
              <p className="text-lg text-zinc-400 leading-relaxed max-w-2xl">
                A comprehensive look at the Model Context Protocol (MCP) tools, APIs, memory structures, and hardware capabilities available to the Colony AI Agent swarm. 
                Agents autonomously invoke these tools to act upon the infrastructure and codebase.
              </p>
            </header>

            <div className="space-y-20">
              {sections.map(section => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                      {section.icon}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-zinc-100">{section.title}</h2>
                      <p className="text-zinc-500 text-sm mt-1">{section.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {section.tools.map(tool => (
                      <div key={tool.name} className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all flex flex-col">
                        <h4 className="text-zinc-200 font-semibold mb-2">{tool.name}</h4>
                        <p className="text-zinc-400 text-sm leading-relaxed mb-6 flex-1">
                          {tool.description}
                        </p>
                        
                        <div className="mt-auto">
                          <span className="text-[10px] font-semibold tracking-widest uppercase text-zinc-600 block mb-2">Used By</span>
                          <div className="flex flex-wrap gap-2">
                            {tool.usedBy.map(agent => (
                              <span key={agent} className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-400 border border-indigo-500/20">
                                {agent}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            
            <footer className="mt-24 pt-8 border-t border-zinc-800 pb-12 flex justify-between items-center text-sm text-zinc-500">
              <p>Colony Documentation</p>
              <p>MCP Toolkit SDK v1.0</p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
