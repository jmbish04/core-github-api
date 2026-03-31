# Rule: Durable Object Abstraction Pattern

## Context
Our backend architecture standardizes Durable Object interactions into two distinct paradigms: AI Agents and WebSocket Broadcasters. Raw mounting of Durable Objects using `idFromName` and `.get()` causes type ambiguity, routing inconsistencies, and runtime errors.

## Core Directives

### 1. Raw DO Instantiation is Forbidden
- **NEVER** use `namespace.idFromName('name')` or `namespace.get(id)` directly within routing files, utility functions, or workflow handlers.
- **NEVER** instantiate raw `Request` objects targeted at `http://agent/...` without a client utility.

### 2. The Agent Paradigm (HoniClient)
All stateful AI Agents in this system are built using the `honidev` framework.
- **RPC Access**: When you need to interact directly with an agent's internal methods (e.g., `stub.chat()`, `stub.workflowComplete()`), you **MUST** use `HoniClient.getStub()`.
- **HTTP Access**: When you need to send an HTTP request to an agent's internal Hono router, you **MUST** use `HoniClient.fetch()`.
- **Import Path**: `import { HoniClient } from '@utils/honi-client';`

### 3. The Broadcast Paradigm (BroadcastClient)
WebSocket broadcasters (e.g., `ROOM_DO`, `JulesWebhookBroadcaster`) are stateful but are not AI agents.
- **Usage**: When dispatching broadcasts or checking room presence, use the unified `BroadcastClient` utility to construct the request.

## Enforcement
This architectural standard replaces legacy utilities such as `getAgentByName` and `routeAgentRequest`, which have been removed from the codebase. Any attempt to reinvent DO mounting wrappers will be blocked during code review.
