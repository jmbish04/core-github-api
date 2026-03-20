import type { AutomationRule, TriggerPayload } from "./types";

export function matchesPushTrigger(
  rule: AutomationRule,
  payload: TriggerPayload,
): boolean {
  if (rule.trigger.event !== "push") {
    return false;
  }

  if (!rule.trigger.branch) {
    return true;
  }

  const ref = String(payload.ref || "");
  const branch = ref.replace("refs/heads/", "");
  return branch === rule.trigger.branch;
}

