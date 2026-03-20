import { matchesCheckRunTrigger } from "./check-run";
import { matchesPullRequestTrigger } from "./pull-request";
import { matchesPushTrigger } from "./push";
import { matchesReleaseTrigger } from "./release";
import {
  createPendingAutomationRun,
  type AutomationRule,
  type AutomationRun,
  type TriggerPayload,
} from "./types";

export type { AutomationRule, AutomationRun } from "./types";

export const DEFAULT_AUTOMATION_RULES: AutomationRule[] = [
  {
    id: "auto-deploy-main",
    name: "Deploy to Production",
    description: "Triggered when code is pushed to the main branch.",
    trigger: { event: "push", branch: "main" },
    workflow: "deploy-production",
  },
  {
    id: "auto-ci-pr",
    name: "Run CI Tests",
    description: "Triggered when a pull request is opened or synchronized.",
    trigger: { event: "pull_request", action: "opened" },
    workflow: "run-tests",
  },
  {
    id: "auto-ci-pr-sync",
    name: "Run CI Tests (sync)",
    description: "Triggered when a pull request receives new commits.",
    trigger: { event: "pull_request", action: "synchronize" },
    workflow: "run-tests",
  },
  {
    id: "auto-notify-check-failure",
    name: "Notify Team on Check Failure",
    description: "Triggered when a check_run completes with a failure.",
    trigger: { event: "check_run", action: "completed" },
    workflow: "notify-check-failure",
  },
  {
    id: "auto-release-deploy",
    name: "Deploy Release",
    description: "Triggered when a new release is published.",
    trigger: { event: "release", action: "published" },
    workflow: "deploy-release",
  },
];

function matchesRule(
  rule: AutomationRule,
  eventType: string,
  action: string | undefined,
  payload: TriggerPayload,
): boolean {
  if (rule.trigger.event !== eventType) {
    return false;
  }

  switch (eventType) {
    case "push":
      return matchesPushTrigger(rule, payload);
    case "pull_request":
      return matchesPullRequestTrigger(rule, action, payload);
    case "check_run":
      return matchesCheckRunTrigger(rule, action, payload);
    case "release":
      return matchesReleaseTrigger(rule, action);
    default:
      return !rule.trigger.action || rule.trigger.action === action;
  }
}

export function matchAutomations(
  rules: AutomationRule[],
  eventType: string,
  eventId: string,
  payload: TriggerPayload,
): AutomationRun[] {
  const action = typeof payload.action === "string" ? payload.action : undefined;

  return rules
    .filter((rule) => matchesRule(rule, eventType, action, payload))
    .map((rule) => createPendingAutomationRun(rule, eventId));
}

