# Agent Honi Audit

## Summary

All runtime agent classes now run on the Honi stack.

There are two supported runtime shapes in this repository:
- Direct Honi agents created with `@/ai/agents/honi#createAgent`
- Honi compatibility agents that inherit from `BaseAgent` or `HonoBaseAgent`, where `BaseAgent` is now backed by a Honi Durable Object created through `createAgent`

These modules were removed from the runtime-agent inventory because they are not actual Durable Object agents:
- `backend/src/workflows/research/orchestrator.ts` — workflow, not an agent
- `backend/src/ai/services/software-engineer.ts` — env-bound AI service, not an agent
- `backend/src/ai/services/colby-implementer.ts` — automation helper service, not an agent
- `backend/src/ai/services/repository-specialist-builder.ts` — automation helper service, not an agent

## Runtime Matrix

| Agent | Path | Description | Tools / MCP | AI Provider | AI Implementation | Agent Framework |
| --- | --- | --- | --- | --- | --- | --- |
| `OrchestratorAgent` | `backend/src/ai/agents/Orchestrator.ts` | Top-level routing and delegation agent for planning and orchestration sessions. | Delegates to `PlannerAgent`; no Honi-declared tools. | Default provider from env | `BaseOrchestrator` -> `BaseAgent` -> `runTextWithModelFallback` via `@/ai/utils/gateway-client` | Honi compatibility via `BaseOrchestrator` -> `BaseAgent` |
| `RetrofitAgent` | `backend/src/ai/agents/retrofit.ts` | Repo retrofit chat agent for modernization and migration guidance. | No explicit tools. | Default provider from env | `HonoBaseAgent` -> structured/text fallback through `@/ai/utils/gateway-client` | Honi compatibility via `HonoBaseAgent` |
| `GeminiAgent` | `backend/src/ai/agents/Gemini.ts` | General Gemini-backed persistent chat agent. | No tools. | `google-ai-studio` | Direct Honi model execution through `@/ai/agents/honi` / `honidev` | Direct Honi `createAgent` |
| `PlannerAgent` | `backend/src/ai/agents/Planner.ts` | Generates concise execution plans. | No tools. | Workers AI | Direct Honi model execution through `@/ai/agents/honi` / `honidev` | Direct Honi `createAgent` |
| `RepoAgent` | `backend/src/ai/agents/github/Repo.ts` | Repository-scoped stateful agent for GitHub webhook ingestion, metrics, and AI generation helpers. | Prompt-time tool metadata for `generateWithTools`; no Honi MCP tool registry. | Default provider from env unless overridden | `BaseAgent` helper methods via `@/ai/utils/gateway-client` and `@/ai/providers/config` | Honi compatibility via `BaseAgent` |
| `Supervisor` | `backend/src/ai/agents/Supervisor.ts` | Supervises containerized tasks, streams logs over WebSockets, and runs health checks. | No Honi tools; invokes health workflows directly. | Anthropic Claude model configured in agent definition | Direct Honi model execution for chat path; custom websocket/health logic in class | Direct Honi `createAgent` |
| `DeepReasoningAgent` | `backend/src/ai/agents/DeepReasoning.ts` | Deep technical reasoning assistant. | No tools. | `google-ai-studio` | Direct Honi model execution through `@/ai/agents/honi` / `honidev` | Direct Honi `createAgent` |
| `OwnerAgent` | `backend/src/ai/agents/github/Owner.ts` | Owner/org-level webhook aggregator and metrics/state tracker. | No runtime tools; primarily webhook/state logic. | No primary AI flow in normal operation; shared provider helpers available through base class. | `BaseAgent` compatibility helpers available, but core logic is stateful Drizzle/DO work. | Honi compatibility via `BaseAgent` |
| `ResearchAgent` | `backend/src/ai/agents/Research.ts` | Repository research agent with GitHub code search capability. | Honi tool: `search_github_code` using Octokit. | Anthropic Claude model configured in agent definition | Direct Honi tool + model execution through `@/ai/agents/honi` / `honidev` | Direct Honi `createAgent` |
| `JulesOverseer` | `backend/src/ai/agents/JulesOverseer.ts` | Monitors long-running Jules sessions and auto-unblocks stuck work. | Prompt-time tools: `get_session_info`, `get_session_snapshot`; integrates `JulesService`. | Default provider from env | `BaseAgent` -> `runTextWithModelFallback` | Honi compatibility via `BaseAgent` |
| `TopicOrchestratorAgent` | `backend/src/ai/agents/TopicOrchestrator.ts` | Research brief lifecycle manager and planning agent. | No explicit tools. | Default provider from env | `BaseAgent` -> `runStructuredResponseWithModelFallback` | Honi compatibility via `BaseAgent` |
| `WebSearchAgent` | `backend/src/ai/agents/WebSearch.ts` | Browser-rendered web search/scraping agent. | Browser automation through `@cloudflare/puppeteer`; no MCP/Honi tools. | N/A for normal execution | No LLM dependency in primary search path. | Honi compatibility via `BaseAgent` |
| `JudgeAgent` | `backend/src/ai/agents/Judge.ts` | Structured evaluator for candidate research artifacts. | No tools. | Default provider from env | `BaseAgent` -> `runStructuredResponseWithModelFallback` | Honi compatibility via `BaseAgent` |
| `ReportingAgent` | `backend/src/ai/agents/Reporting.ts` | Synthesizes research findings into a final markdown report. | No tools. | Default provider from env | `BaseAgent` -> `runTextWithModelFallback` | Honi compatibility via `BaseAgent` |
| `LandingPageAgent` | `backend/src/ai/agents/LandingPageAgent.ts` | Refines landing page analysis/configuration payloads. | No tools. | Workers AI | Direct Honi model execution through `@/ai/agents/honi` / `honidev` | Direct Honi `createAgent` |
| `CloudflareDocsAgent` | `backend/src/ai/agents/CloudflareDocs.ts` | Cloudflare documentation assistant with dynamic standards injection. | Indirect standards query through `makeQueryStandardsTool`; no Honi tool registry or MCP server tools. | Default provider from env | `HonoBaseAgent` -> structured/text fallback through `@/ai/utils/gateway-client` | Honi compatibility via `HonoBaseAgent` |
| `DeepResearchChatAgent` | `backend/src/ai/agents/DeepResearchChat.ts` | Interactive chat surface for deep research orchestration. | No tools. | Default provider from env | `HonoBaseAgent` -> structured/text fallback through `@/ai/utils/gateway-client` | Honi compatibility via `HonoBaseAgent` |
| `HealthDiagnostician` | `backend/src/ai/agents/HealthDiagnostician.ts` | Automated health-failure diagnostician with remediation and Jules delegation. | Inline prompt-time tools including GitHub file access, duplicate PR checks, PR creation, Jules delegation, Cloudflare docs lookup; uses Octokit, Vectorize, and `queryMCP`. | Default provider from env | `BaseAgent` -> `runStructuredResponseWithModelFallback` / `runTextWithModelFallback` | Honi compatibility via `BaseAgent` |
| `WorkshopAgent` | `backend/src/ai/agents/workshop/WorkshopAgent.ts` | Workshop wizard orchestration agent for project planning and repo creation. | No Honi-declared tools; orchestrates D1 and repo sync services directly. | Default provider from env | `HonoBaseAgent` -> structured/text fallback through `@/ai/utils/gateway-client` | Honi compatibility via `HonoBaseAgent` |
| `CfWorkshop_AgentsSdk` | `backend/src/ai/agents/workshop/CfAgentsSdk.ts` | Cloudflare agent-building and debugging assistant for workshop flows. | No explicit runtime tools in code; prompt advertises Cloudflare agent expertise. | Default provider from env | `HonoBaseAgent` -> structured/text fallback through `@/ai/utils/gateway-client` | Honi compatibility via `HonoBaseAgent` |
| `StandardizationAgent` | `backend/src/ai/agents/StandardizationAgent.ts` | Standards-analysis agent that prepares downstream remediation prompts. | Prompt-time tools: `makeQueryStandardsTool`, `search_cloudflare_documentation` via `queryMCP`. | Default provider from env | `BaseAgent` -> `runTextWithModelFallback` | Honi compatibility via `BaseAgent` |

## Shared Runtime Notes

- `backend/src/ai/agents/base/BaseAgent.ts` is now a Honi-backed compatibility base built on `@/ai/agents/honi#createAgent`.
- `backend/src/ai/agents/base/HonoBaseAgent.ts` remains the structured chat-oriented extension over that Honi-backed base.
- `backend/src/ai/agents/runtime/agents.ts` remains the repo-local runtime facade for Honi-compatible Durable Object agents.
- `backend/src/ai/agents/runtime/openai.ts` is still present only as a compatibility helper for workflows and non-agent execution paths; it is not used as the framework for the runtime agents above.
- `backend/src/ai/agents/runtime/workflows.ts` remains a workflow compatibility layer, not an agent runtime.
