import type { AutomationRule, TriggerPayload } from "./types";

const FAILING_CONCLUSIONS = new Set(["failure", "timed_out"]);

export function matchesCheckRunTrigger(
  rule: AutomationRule,
  action: string | undefined,
  payload: TriggerPayload,
): boolean {
  if (rule.trigger.event !== "check_run") {
    return false;
  }

  if (rule.trigger.action && rule.trigger.action !== action) {
    return false;
  }

  if (
    rule.id === "auto-notify-check-failure" &&
    action === "completed"
  ) {
    const conclusion = String(payload.check_run?.conclusion || "");
    return FAILING_CONCLUSIONS.has(conclusion);
  }

  return true;
}

