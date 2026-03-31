import type { AutomationRule, TriggerPayload } from "./types";

export function matchesPullRequestTrigger(
  rule: AutomationRule,
  action: string | undefined,
  payload: TriggerPayload,
): boolean {
  if (rule.trigger.event !== "pull_request") {
    return false;
  }

  if (rule.trigger.action && rule.trigger.action !== action) {
    return false;
  }

  if (!rule.trigger.branch) {
    return true;
  }

  const baseBranch = String(payload.pull_request?.base?.ref || "");
  return baseBranch === rule.trigger.branch;
}

