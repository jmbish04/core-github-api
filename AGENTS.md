# Gemini Agent Development Guidelines

> **Golden Rule**: ALWAYS use the `@google/genai` SDK. NEVER use `@google/generative-ai`.

## Core Directives

1.  **SDK**: `import { GoogleGenAI } from "@google/genai";`
2.  **Instantiation**: `const ai = new GoogleGenAI({ apiKey: ... });`
3.  **Models**:
    -   **General**: `gemini-2.5-flash` (or `gemini-2.0-flash-exp` if requested)
    -   **Reasoning**: `gemini-2.0-flash-thinking-exp-1219` (if available) or `gemini-2.5-pro`
    -   **Images**: `gemini-2.5-flash-image`
4.  **Configuration**: Pass `responseMimeType: "application/json"` and `responseSchema` for structured output.

## Code Patterns

### ✅ Correct (New SDK)

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const result = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [{ role: "user", parts: [{ text: "Hello" }] }],
  config: {
    responseMimeType: "application/json",
    // responseSchema: ... (Zod schema converted to JSON)
  }
});

console.log(result.text); // Getter, returns string
```

### ❌ Incorrect (Legacy/Deprecated)

-   `require('@google/generative-ai')`
-   `genai.getGenerativeModel(...)`
-   `model.generateContent(...)` (Called on model instance instead of `ai.models`)
-   `generationConfig` (Use `config` property instead)
-   `result.response.text()` (Method call)

## Structured Outputs

Always use `zod` and `zod-to-json-schema` to define your `responseSchema`.

```typescript
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const MySchema = z.object({ ... });

// ... inside generateContent config:
responseSchema: zodToJsonSchema(MySchema) as any
```

## Tools (MCP)

When integrating tools:
1.  Use `src/lib/mcp.ts` to connect to Cloudflare Docs or other MCP servers.

## Exit Criteria & Verification

Before reporting a task or turn as complete, you **MUST**:

1.  **Clear Linting Errors**: Ensure `bun run check` (or checking the IDE output) reveals no linting or compilation errors.
2.  **Verify Deployment**: Run `bun run dry-run` to validate the worker configuration and build process.
    -   This executes `wrangler deploy --dry-run` to catch binding issues, bundle size limits, or config errors.
    -   **Fix any errors** reported by this command before finishing.

# Antigravity Strategy: Agentic Research Team

## Context
We are deploying a dedicated **Agentic Research Team** consisting of a stateful Orchestrator (`ResearchAgent`) and durable execution pipelines (`DeepResearchWorkflow`). This system performs deep code analysis using Sandbox containers and Vectorize RAG, delivering findings via real-time WebSocket updates and daily email reports.

## Architectural Pillars
1.  **The Brain (Agents SDK)**: `ResearchAgent` maintains state, chat history, and HITL (Human-in-the-Loop) approvals.
2.  **The Muscle (Workflows)**: `DeepResearchWorkflow` handles long-running tasks (Cloning, Vectorizing) without timeout risks.
3.  **The Tools (MCP + Sandbox)**:
    *   **Native MCP Adapter**: Adapts official GitHub MCP tool schemas to run on `octokit` within V8.
    *   **Sandbox**: Ephemeral environments for `git clone` and code execution.
4.  **The Signal (Daily Discovery)**: Cron Trigger -> Workflow -> HTML Report -> Email.

## Task List

### Infrastructure & Configuration
- [ ] **Config**: Update `wrangler.jsonc` with bindings:
    - [ ] `kv_namespaces`: `AGENT_CACHE`
    - [ ] `vectorize_indexes`: `RESEARCH_INDEX` (Dimensions: 1024 for `@cf/baai/bge-large-en-v1.5`)
    - [ ] `ai`: `AI`
    - [ ] `workflows`: `DEEP_RESEARCH_WORKFLOW`
    - [ ] `send_email`: `EMAIL_SENDER`
    - [ ] `browser`: `BROWSER` (Sandbox assets)

### Component 1: MCP Integration (Native Adapter)
- [ ] **File**: `src/mcp/github-official-adapter.ts`
    -   **Strategy**: Replicate the *schemas* of the official `@modelcontextprotocol/server-github` but implement the *logic* using your existing `src/octokit` client to ensure V8 compatibility.
    -   **Registry**: Export these tools to the shared MCP toolkit (`src/mcp/index.ts`).

### Component 2: The Research Team
- [ ] **File**: `src/agents/ResearchAgent.ts` (The Manager)
    -   **State Machine**: `PLANNING` -> `RESEARCHING` -> `REVIEW_REQUIRED` -> `COMPLETED`.
    -   **Capabilities**: `runWorkflow`, `waitForEvent` (HITL), `getAgentByName`.
- [ ] **File**: `src/workflows/DeepResearchWorkflow.ts` (The Workers)
    -   **Step 1**: `setup-sandbox`: Init Sandbox, `git clone`.
    -   **Step 2**: `analysis-macro`: Run `ls -R`, tree, read `README`.
    -   **Step 3**: `vectorize`: Chunk code, embed (Workers AI), upsert to `RESEARCH_INDEX`.
    -   **Step 4**: `cleanup`: Destroy Sandbox.

### Component 3: Daily Discovery
- [ ] **File**: `src/schedulers/daily-scan.ts`
    -   **Trigger**: Cron (e.g., 9 AM UTC).
    -   **Logic**: Scans GitHub trending/new -> Triggers `DeepResearchWorkflow`.
    -   **Report**: Generates HTML via LLM -> Sends via `env.EMAIL_SENDER`.

## Verification
1.  **MCP**: Verify tools `gh_official_search` and `gh_official_read` are available in the Agent's tool list.
2.  **Research**: Send "Analyze facebook/react" to `ResearchAgent`. Verify Workflow logs showing Sandbox clone.
3.  **Email**: Trigger cron manually via `npx wrangler triggers fire --name "daily-scan"`.