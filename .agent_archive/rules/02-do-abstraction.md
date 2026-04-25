---
trigger: always_on
---

# Rule: Agent Routing and DO Abstraction

## Context
Our backend architecture standardizes stateful AI Agents and WebSocket connections using the official Cloudflare Agents SDK (`agents` package). We strictly avoid legacy wrappers like `HoniClient`, as well as raw `idFromName` manipulation for Agent classes, to ensure compatibility with `assistant-ui` and the `@cloudflare/ai-chat` ecosystem.

## Core Directives

### 1. Cloudflare Agents SDK First
- Always prefer the official Cloudflare Agents SDK (`AIChatAgent`, `Agent`, `McpAgent`) for stateful execution, memory, and WebSockets over third-party orchestration libraries. 
- **Dynamic Heavy SDKs:** If you absolutely must use a heavy external orchestrator or AST parser inside a specific tool execution, dynamically `import()` it inside the method to preserve sub-50ms cold starts for the Durable Object.
- **AI Gateway Routing:** Always format model identifiers as `${provider}/${model}` and ensure all internal `env.AI` or external LLM client calls are routed through Cloudflare AI Gateway for unified observability, caching, and fallback logic.

### 2. Raw DO Instantiation is Forbidden for Agents
- **NEVER** use `env.AGENT_NAMESPACE.idFromName('name')` followed by raw `.get()` and `.fetch()` for Agent routing.
- **NEVER** manually construct HTTP or WebSocket upgrade requests to talk to an Agent from the router.

### 3. The Cloudflare Agents SDK Paradigm
All stateful AI Agents in this system MUST extend the `Agent`, `McpAgent`, or `AIChatAgent` class from the `agents` package.
- **Global Routing**: You **MUST** use `routeAgentRequest(request, env.YOUR_AGENT_BINDING)` at the Hono API boundary to seamlessly pass HTTP and WebSocket traffic directly to the Agent.
- **Internal RPC**: When one Worker or Agent needs to interact with another Agent's custom methods, use the standard Agent invocation patterns and `@callable()` methods as defined in the official SDK.

### 4. Durable Objects with SQLite State
- NEVER use `new_classes` for SQLite-backed Durable Objects. ALWAYS use `new_sqlite_classes` in the migrations array.
- Any class extending `Agent` from `@cloudflare/agents` REQUIRES `new_sqlite_classes`. Violation causes runtime errors: "SQLite storage not available."
- **Fresh Deployment**: If the worker has **never** been deployed to production, you MAY add new classes to `migrations.v1`.
- **Standard Deployment**: If the worker **has** been deployed, you **MUST** create a new migration version (e.g., `v2` -> `v3`). Do NOT add to previous tags.
- Use a docstring comment in the JSON to explain the purpose of the new class.

### 5. Frontend Decoupling
- The Hono router acts as the universal proxy.
- Frontend components using `assistant-ui` and the `@cloudflare/ai-chat` hook (`useAgentChat`) must point directly to the Hono proxy routes (e.g., `/api/agents/:agentName/:room`), remaining entirely decoupled from the underlying Durable Object ID mechanics.
- Use `BroadcastClient` ONLY for pure webhooks and non-agent PubSub scenarios.