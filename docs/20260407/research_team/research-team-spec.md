# Antigravity Strategy: Agentic Research Team

## Context

We are deploying a dedicated **Agentic Research Team** consisting of a stateful Orchestrator (`ResearchAgent`) and durable execution pipelines (`DeepResearchWorkflow`). This system performs deep code analysis using Sandbox containers and Vectorize RAG, delivering findings via real-time WebSocket updates and daily email reports.

## Architectural Pillars

1.  **The Brain (Agents SDK)**: `ResearchAgent` maintains state, chat history, and HITL (Human-in-the-Loop) approvals.
2.  **The Muscle (Workflows)**: `DeepResearchWorkflow` handles long-running tasks (Cloning, Vectorizing) without timeout risks.
3.  **The Tools (MCP + Sandbox)**:
    - **Native MCP Adapter**: Adapts official GitHub MCP tool schemas to run on `octokit` within V8.
    - **Sandbox**: Ephemeral environments for `git clone` and code execution.
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
  - **Strategy**: Replicate the _schemas_ of the official `@modelcontextprotocol/server-github` but implement the _logic_ using your existing `src/octokit` client to ensure V8 compatibility.
  - **Registry**: Export these tools to the shared MCP toolkit (`src/mcp/index.ts`).

### Component 2: The Research Team

- [ ] **File**: `src/agents/ResearchAgent.ts` (The Manager)
  - **State Machine**: `PLANNING` -> `RESEARCHING` -> `REVIEW_REQUIRED` -> `COMPLETED`.
  - **Capabilities**: `runWorkflow`, `waitForEvent` (HITL), `getAgentByName`.
- [ ] **File**: `src/workflows/DeepResearchWorkflow.ts` (The Workers)
  - **Step 1**: `setup-sandbox`: Init Sandbox, `git clone`.
  - **Step 2**: `analysis-macro`: Run `ls -R`, tree, read `README`.
  - **Step 3**: `vectorize`: Chunk code, embed (Workers AI), upsert to `RESEARCH_INDEX`.
  - **Step 4**: `cleanup`: Destroy Sandbox.

### Component 3: Daily Discovery

- [ ] **File**: `src/schedulers/daily-scan.ts`
  - **Trigger**: Cron (e.g., 9 AM UTC).
  - **Logic**: Scans GitHub trending/new -> Triggers `DeepResearchWorkflow`.
  - **Report**: Generates HTML via LLM -> Sends via `env.EMAIL_SENDER`.

## Verification

1.  **MCP**: Verify tools `gh_official_search` and `gh_official_read` are available in the Agent's tool list.
2.  **Research**: Send "Analyze facebook/react" to `ResearchAgent`. Verify Workflow logs showing Sandbox clone.
3.  **Email**: Trigger cron manually via `pnpm dlx wrangler@latest triggers fire --name "daily-scan"`.
