# Rule: Mandatory Traceability & Structured Logging

## Core Mandate (Non-Negotiable)

**ALL backend code MUST use the `Logger` class from `src/lib/logger.ts` for logging.** This class outputs structured JSON to console AND mirrors every log entry to D1 (`system_logs` table) for persistence and auditability.

### Forbidden Patterns

```typescript
// ❌ FORBIDDEN — raw console calls bypass D1 mirroring
console.log("something happened");
console.error("something failed:", error);
console.warn("warning");

// ❌ FORBIDDEN — truncating error messages or inputs hides root cause
this.logger.debug(`Running orchestration for: ${input.slice(0, 100)}...`); 
logger.error(`failed`, { body: errBody.substring(0, 200) });
```

### Required Pattern

```typescript
import { Logger } from '@/lib/logger';

// ✅ CORRECT — Logger instance per class, with source override
constructor(protected readonly env: Env, loggerNamespace = 'orchestration/base') {
  this.logger = new Logger(env, loggerNamespace);
}
this.logger.debug(`Running orchestration for: ${input}`);
this.logger.error('Operation failed', { error: error.message, stack: error.stack, responseBody: fullBody });
await this.logger.flush(); // MUST flush before returning or throwing
```

### Full Error Bodies (MANDATORY)

When logging error responses or inputs, you MUST log the **complete** string or error body. Truncating with `.slice()`, `.substring()`, or any other method is **strictly forbidden**. Truncated strings are useless for debugging and hide root causes.

```typescript
// ❌ WRONG
this.logger.debug(`Running orchestration for: ${input.slice(0, 100)}...`); 
const body = await res.text();
logger.error('API failed', { body: body.slice(0, 200) });

// ✅ CORRECT
this.logger.debug(`Running orchestration for: ${input}`);
const body = await res.text();
logger.error('API failed', { status: res.status, body });
```

## Agent Evaluation Duty (MANDATORY)

Every time an agent evaluates, reviews, modifies, or creates code, it MUST also evaluate:

1. **Traceability Coverage**: Does every significant code path (entry points, error handlers, external API calls, state transitions) have adequate logging?
2. **Logger Usage**: Is the code using `Logger` from `src/lib/logger.ts`? If it uses raw `console.log`/`console.error`/`console.warn`, the agent MUST migrate it.
3. **Error Completeness**: Are error messages logged in full, without `.slice()`, `.substring()`, or truncation?
4. **Flush Discipline**: Is `await logger.flush()` called before every early return, throw, or function exit in error paths?

### When to Add Logging

- **New features**: Every public function must log entry with key parameters
- **Error handlers**: Every `catch` block must log the full error with stack trace
- **External calls**: Every `fetch()` to an external API must log the request (URL, method) and response (status, body on failure)
- **State transitions**: Workflow steps, agent state changes, and provider switches must be logged

### Standard Source Overrides

| Component | Source Override |
|-----------|----------------|
| AI Gateway | `'AIGateway'` |
| Workers AI | `'WorkerAI'` |
| OpenAI | `'OpenAI'` |
| Anthropic | `'Anthropic'` |
| Gemini | `'Gemini'` |
| AI Router | `'AIRouter'` |
| Gateway Health | `'GatewayHealth'` |
| Diagnostician | `'Diagnostician'` |
| Webhook handler | `'Webhooks'` |
| Health checks | `'HealthCheck'` |
| MCP tools | `'MCP:<ToolName>'` |
| Workflows | `'Workflow:<Name>'` |
