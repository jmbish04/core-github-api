# Alerts Standards

## 1. The `createAlert()` Contract

Every new feature that may fail, produce notable events, or require user attention **MUST** emit alerts using the canonical `createAlert()` function:

```typescript
import { createAlert } from "@alerts";

await createAlert(env, {
  type: "deployment", // AlertType: health | webhook | security | deployment | agent | info
  severity: "error", // AlertSeverity: info | warning | error | critical
  title: "Deploy failed",
  description: "Wrangler exited with code 1. Check logs.",
  link_url: "/webhooks", // Optional deep-link (relative path)
  process_origin: "DeployWorkflow", // Human-readable origin
});
```

`createAlert()` is fire-and-forget: it never throws, never blocks the main thread, and auto-gates based on `ALERTS_CONFIG` in KV.

## 2. When to Emit Alerts

| Scenario                            | Type         | Severity              |
| ----------------------------------- | ------------ | --------------------- |
| Health check failure                | `health`     | `error` or `critical` |
| Webhook delivery failure (repeated) | `webhook`    | `warning`             |
| Detected secret leak                | `security`   | `critical`            |
| Worker deploy failure               | `deployment` | `error`               |
| Agent task failure after retries    | `agent`      | `error`               |
| Informational system event          | `info`       | `info`                |

Do **NOT** alert on:

- Expected/transient 4xx responses
- Individual tool-call retries (only alert on final failure)
- Debug or verbose logs (use `console.log` / `@logging` for those)

## 3. Config-Gated Alerts

`createAlert()` reads `ALERTS_CONFIG` from `KV_CONFIGS` at emit time. If a type is disabled or the master switch is off, the alert is dropped silently. You do not need to check the config yourself — the service handles it.

## 4. Path Alias

Always use `@alerts` — never use a relative import:

```typescript
// ✅ Correct
import { createAlert } from "@alerts";

// ❌ Wrong
import { createAlert } from "../../alerts";
```

## 5. New Alert Types

If you need a new alert type (beyond the 6 built-in), you must:

1. Add it to `ALERT_TYPES` in `backend/src/db/schemas/app/alerts.ts`
2. Add it to `AlertTypeFlags` in `backend/src/alerts/config.ts`
3. Add its `TYPE_META` entry in `AlertTray.tsx` and `Alerts.tsx`
4. Run `pnpm drizzle-kit generate` if schema changed
