# Observability, Logging & Error Handling

## 1. Traceability & Structured Logging (The "Glass Box" Principle)
- **Mandate**: ALL backend code MUST use the `Logger` class from `@/lib/logger` (or `src/lib/logger.ts`). This class outputs structured JSON to console AND mirrors every log entry to D1 (`system_logs` table) for persistence and auditability.
- **Frontend vs Backend**: The `Logger` class is strictly for the backend. The frontend has its own logging system.
- **Instantiation**: When instantiating `Logger`, you MUST pass `env` and `loggerNamespace`. Example: `const logger = new Logger(env, "SandboxSDK"); logger.info("Executing...");`
- **Full Error Bodies**: Truncating error messages or inputs with `.slice()` or `.substring()` is STRICTLY FORBIDDEN. Truncated strings hide root causes.
- **Flush Discipline**: You MUST call `await logger.flush()` before exiting the thread (early return, throw, etc.) to commit logs. DO NOT use raw `console.log`/`error`/`warn`.
- **Source Overrides**: Pass the correct `loggerNamespace` when instantiating the Logger (e.g., `'AIGateway'`, `'Webhooks'`, `'MCP:<ToolName>'`).

## 2. Global Error Handling
- **Backend D1 Mirror**: Errors must be persistently logged using `this.logger.error("Description", { details: error.message, ...context })` and flushed.
- **Frontend Error UI**: When a component catches an error, pass the literal error string to `import { handleGlobalError } from '@/lib/error-handler'`. DO NOT use raw `toast.error()` or local `console.error` for system/API errors.
- **Strict Passthrough**: Agents must ensure backend routes return the actual error string from failed upstream services (e.g., GitHub API 404s, Stripe 402s).

## 3. Alerts Standards
- **Contract**: Use `createAlert()` from `@alerts` for events requiring user attention (e.g., deployment failures, secret leaks).
- **Fire-and-Forget**: `createAlert()` is non-blocking and auto-gated based on KV config.
- **Categories**: Valid severity: `info | warning | error | critical`. DO NOT alert on transient 4xx errors or individual tool retries.

## 4. Health Check Governance
- **Mandate**: Every new domain module under `backend/src/` MUST register a check in `src/health/coordinator.ts`.
- **Dynamic Tests**: Runtime endpoint monitoring uses the `health_test_definitions` D1 table.
- **AI Remediation**: Failed tests receive AI hints stored in the `ai_suggestion` column.

## 5. Security & Auditing Standards
- **Defense in Depth**: Sensitive data (`_KEY`, `_TOKEN`, `_SECRET`) MUST be masked using `sanitizeForAudit` (`src/lib/masking.ts`) before persistent storage outside KV.
- **Configuration Audit**: State changes to config via API must create an immutable entry in `config_audit_logs`.
- **Secrets Management**: ALL backend code MUST retrieve secrets using `getSecret(env, 'SECRET_NAME')` from `@/utils/secrets` instead of directly accessing `env.SECRET_NAME` or `env.SECRET_NAME.get()`.
