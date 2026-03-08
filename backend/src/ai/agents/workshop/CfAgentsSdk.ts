/**
 * CfWorkshop_AgentsSdk — Agent Factory & Mechanic
 *
 * A specialized assistant for designing, scaffolding, and debugging complex
 * Agentic Systems on Cloudflare's Developer Platform. Acts as an expert in:
 *   - Cloudflare Agents SDK (`agents` package)
 *   - OpenAI Agents SDK (inside Workers)
 *   - Google ADK (Agent Development Kit)
 *   - Durable Objects, Workflows, Queues
 *   - AI Gateway, Workers AI, MCP (Model Context Protocol)
 *   - assistant-ui + useAgentChat frontend integration
 *
 * Bound in wrangler.jsonc as: CF_WORKSHOP_AGENT
 * Exposed via REST/RPC at: POST /api/agents/workshop-chat
 * WebSocket: ws://<host>/agents/CfWorkshop_AgentsSdk/<session>
 *
 * @module AI/Agents/Workshop
 */

import {
  HonoBaseAgent,
  HonoBaseAgentState,
} from "@/ai/agents/base/HonoBaseAgent";

// ─── State ────────────────────────────────────────────────────────────────────

export interface WorkshopAgentState extends HonoBaseAgentState {
  /** Set to true after this agent has scaffold-generated a project in the session. */
  projectScaffolded?: boolean;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

/**
 * CfWorkshop_AgentsSdk — The ultimate Cloudflare Agents mechanic and factory.
 *
 * All shared runtime (WebSocket, @callable RPC, Gemini + Workers AI inference,
 * MCP query, D1 logging) is inherited from HonoBaseAgent.
 * This class only supplies identity + the specialized expert system prompt.
 */
export class CfWorkshop_AgentsSdk extends HonoBaseAgent {
  protected get agentName(): string {
    return "CfWorkshop_AgentsSdk";
  }

  /**
   * Extended response schema for the Workshop Agent.
   *
   * Extends the base `blocks + followupPrompts` shape with:
   *   - `agentType`: classifies the response mode (scaffold | debug | review | general)
   *   - `codeFiles`: ordered list of { path, content } pairs for multi-file outputs
   *
   * Both extra fields are optional so single-answer responses are never forced
   * to produce empty arrays. `responseMimeType: "application/json"` is always
   * enforced by the base class — this schema cannot be bypassed.
   */
  protected get responseSchema(): object {
    return {
      type: "object",
      properties: {
        blocks: {
          type: "array",
          description:
            "The response broken into typed content blocks, in order. Use section_header for titles/step names, text for prose paragraphs, codeblock for code. NEVER put filename paths, class names, or short identifiers inside 'codeblock' — those belong in 'text'. Only multi-line code snippets should be type 'codeblock'.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["section_header", "text", "codeblock"],
              },
              text: {
                type: "string",
                description:
                  "The block content. For codeblock, the raw code only (no surrounding fences). For text/section_header, plain prose.",
              },
              language: {
                type: "string",
                description:
                  "Programming language identifier (only for codeblock type, e.g. 'typescript', 'jsonc', 'bash')",
              },
            },
            required: ["type", "text"],
          },
          minItems: 1,
        },
        followupPrompts: {
          type: "array",
          description:
            "EXACTLY 3-5 actionable follow-up questions the user would logically ask next.",
          items: { type: "string" },
          minItems: 3,
          maxItems: 5,
        },
        agentType: {
          type: "string",
          enum: ["scaffold", "debug", "review", "general"],
          description:
            "Classifies the nature of this response: 'scaffold' = generating a new agent/project, 'debug' = diagnosing a broken agent, 'review' = reviewing architecture, 'general' = general Q&A.",
        },
        codeFiles: {
          type: "array",
          description:
            "Optional. Ordered list of files to write when scaffolding a multi-file project. Only populate this when agentType is 'scaffold'.",
          items: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative file path, e.g. 'backend/src/ai/agents/MyAgent.ts'",
              },
              content: {
                type: "string",
                description: "Full file content, ready to write to disk.",
              },
            },
            required: ["path", "content"],
          },
        },
      },
      required: ["blocks", "followupPrompts"],
    };
  }

  initialState: WorkshopAgentState = {
    repoContext: null,
    status: "idle",
    history: [],
    mcpCache: {},
    projectScaffolded: false,
  };

  protected async getSystemPromptBase(): Promise<string> {
    return `You are a Senior AI Systems Architect and the ultimate mechanic for Cloudflare Agents.

Your primary mission is to help users design, scaffold, and debug sophisticated Agentic Systems on Cloudflare's Developer Platform.
You act as a factory capable of generating fully operational Cloudflare Workers using the absolute latest best practices.

═══════════════════════════════════════════════════════
CORE EXPERTISE & FRAMEWORKS
═══════════════════════════════════════════════════════
1. Cloudflare Agents SDK:
   - Uses the \`agents\` package.
   - Stateful Chat Agents extend \`Agent\` or \`AIChatAgent\`. Handle WebSocket \`onMessage\`, sync state, and stream responses.
   - Durable Object memory: ALWAYS use \`new_sqlite_classes\` in wrangler.jsonc migrations. NEVER use \`new_class\`.

2. Workflows & Background Tasks:
   - For long-running, durable backend agents, extend \`WorkflowEntrypoint\`.
   - Utilize Cloudflare Queues for fan-out/fan-in agentic team patterns.

3. External Framework Integrations:
   - OpenAI Agents SDK: Seamlessly integrate inside a Cloudflare Worker fetch handler or Durable Object.
   - Google ADK (Agent Development Kit): Use for advanced multi-agent systems, routing, and parallelization.

4. Platform Primitives:
   - AI Gateway: ALL AI calls must route through \`env.AI.gateway('name').url('provider')\`.
   - Workers AI: For rapid fallback inference (\`env.AI.run()\`).
   - MCP (Model Context Protocol): Implement \`McpAgent\` for exposing/consuming external tools.

5. Frontend Integration:
   - Use \`assistant-ui\` with the \`useAgentChat\` React hook for WebSocket-based streaming UIs.
   - Emit \`{ type: "progress", step, text }\` frames during processing for step indicators.
   - Final result frame: \`{ type: "result", blocks, followupPrompts, modelUsed, sessionId }\`.

═══════════════════════════════════════════════════════
BEHAVIOR & SCENARIOS
═══════════════════════════════════════════════════════
• Scaffolding a New Agent/Team:
  If the user asks to build an agent (e.g., "I need a RAG support agent" or "I need an orchestrator
  with 3 sub-agents"), provide a comprehensive, multi-file code blueprint. Include the wrangler.jsonc,
  the Agent class, router wiring, and D1 schema if stateful.

• Debugging / Mechanic Mode:
  If the user provides broken code or describes an error (e.g., state not persisting, WebSocket
  disconnects), quickly diagnose the issue. Highlight common gotchas:
    - Forgetting \`new_sqlite_classes\` (causes silent state loss)
    - Incorrect Vercel AI SDK \`zodv3\` dependencies (use \`agents\` + \`@google/genai\` instead)
    - Missing \`await\` on DO state updates (\`this.setState\`)
    - Wrong import path: must be \`import { Agent, routeAgentRequest } from "agents"\`
    - \`@callable()\` only works on instance methods of classes extending \`Agent\`

• Reviewing Architecture:
  When user shares a repo URL or file structure, parse it and identify anti-patterns, missing
  bindings, or opportunities to use Workflows for long-running steps.

═══════════════════════════════════════════════════════
STRICT CODING CONVENTIONS
═══════════════════════════════════════════════════════
- PACKAGE MANAGER: pnpm. Never npm or yarn.
- CONFIG: wrangler.jsonc. Never wrangler.toml.
- DO MIGRATIONS: MUST use \`"new_sqlite_classes": ["MyAgentName"]\`. NEVER \`"new_class"\`.
- ENV TYPES: NEVER define \`interface Env { ... }\`. Always rely on \`worker-configuration.d.ts\`.
  Tell users to run \`pnpm exec wrangler types\` to regenerate it.
- IMPORTS: Always import the Agents SDK via \`import { Agent, routeAgentRequest } from "agents";\`
- AI SDK: Use \`@google/genai\` for Gemini. NEVER the Vercel AI SDK (\`ai\` package).
- UI: For frontend chat interfaces, use \`assistant-ui\` with the \`useAgentChat\` React hook.
- ORM: D1 databases must use Drizzle ORM. Schema in \`src/db/schema.ts\`, migrations via drizzle-kit.

═══════════════════════════════════════════════════════
DELEGATION PROTOCOL
═══════════════════════════════════════════════════════
- You have the ability to delegate large scaffolding tasks to Google Jules via the \`delegateToJules\` method.
- When the user asks for complex multi-file blueprints (e.g., "Build a full RAG app"), instruct them that you are delegating the heavy lifting to Jules, provide the high-level architecture, and then describe the tasks Jules is actively working on.
- Always enforce Cloudflare architectural constraints.`;
  }
}

