---
description: Step-by-step workflow for adding alert emission to a backend feature
---

# Workflow: Implement Alert

Use this workflow any time a new feature, agent, or workflow should surface alerts to the user via the nav badge, tray, Sonner toasts, and /alerts page.

## Steps

1. **Identify alert conditions** in your feature (failures, notable events, action-required states).

2. **Import the service:**

   ```typescript
   import { createAlert } from "@alerts";
   ```

3. **Emit the alert** at the appropriate failure/event point:

   ```typescript
   await createAlert(env, {
     type: "agent",
     severity: "error",
     title: "ResearchAgent: exceeded budget",
     description: `Agent used ${tokens} tokens, exceeding the ${limit} budget.`,
     link_url: "/research",
     process_origin: "ResearchAgent",
   });
   ```

   > Use `ctx.waitUntil(createAlert(...))` if inside a scheduled handler or Workflow entrypoint.

4. **Choose the correct type and severity** per the `.agent/rules/alerts-standards.md` table.

5. **Verify in the UI:**
   - Navigate to `/alerts` — the alert should appear as an active alert
   - Bell badge in the nav header should show the unread count
   - If the alert was created within the last 60s, a Sonner toast should appear automatically on next page load

6. **Test config gating** (optional):
   - Go to `/settings/alerts`, disable the alert type
   - Trigger the alert condition again — it should NOT appear in the tray

## Notes

- `createAlert()` is safe to call without try/catch — it swallows all errors internally.
- Never import directly from `backend/src/alerts` using relative paths; use the `@alerts` alias.
- The alert's `link_url` should be a relative frontend path that makes it easy for the user to take action.
