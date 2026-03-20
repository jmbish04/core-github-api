import type { AutomationRule } from "./types";

export function matchesReleaseTrigger(
  rule: AutomationRule,
  action: string | undefined,
): boolean {
  if (rule.trigger.event !== "release") {
    return false;
  }

  if (rule.trigger.action && rule.trigger.action !== action) {
    return false;
  }

  return true;
}

