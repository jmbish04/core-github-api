/**
 * @file automations/registry.ts
 * @description Automation rules registry: defines rules that map webhook
 *   events to triggered workflows, and a matcher function.
 */

// ── Types ──────────────────────────────────────────────────────────

export type AutomationRule = {
  id: string;
  name: string;
  description: string;
  trigger: {
    /** GitHub event type (e.g. "push", "pull_request", "check_run") */
    event: string;
    /** Optional action within the event (e.g. "opened", "completed") */
    action?: string;
    /** Optional branch filter (matches ref for push, base branch for PRs) */
    branch?: string;
  };
  /** Logical workflow identifier (e.g. "deploy-production", "run-tests") */
  workflow: string;
};

export type AutomationRun = {
  id: string;
  ruleId: string;
  ruleName: string;
  workflow: string;
  eventId: string;
  status: "pending" | "in_progress" | "succeeded" | "failed";
  startedAt: string;
  completedAt?: string;
};

// ── Built-in rules ─────────────────────────────────────────────────

export const AUTOMATION_RULES: AutomationRule[] = [
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

// ── Matcher ────────────────────────────────────────────────────────

/**
 * Matches incoming webhook events against the automation registry.
 * Returns a list of `AutomationRun` objects for every matched rule.
 */
export function matchAutomations(
  eventType: string,
  eventId: string,
  payload: Record<string, any>,
): AutomationRun[] {
  const matched: AutomationRun[] = [];
  const action: string | undefined = payload.action;

  for (const rule of AUTOMATION_RULES) {
    // 1. Event type must match
    if (rule.trigger.event !== eventType) continue;

    // 2. Action filter (if specified)
    if (rule.trigger.action && rule.trigger.action !== action) continue;

    // 3. Branch filter (if specified)
    if (rule.trigger.branch) {
      // For push events, check the ref
      if (eventType === "push") {
        const ref: string = payload.ref || "";
        const branch = ref.replace("refs/heads/", "");
        if (branch !== rule.trigger.branch) continue;
      }
      // For pull_request events, check base branch
      if (eventType === "pull_request") {
        const baseBranch: string = payload.pull_request?.base?.ref || "";
        if (baseBranch !== rule.trigger.branch) continue;
      }
    }

    // 4. Special case: check_run failure filter
    if (
      rule.id === "auto-notify-check-failure" &&
      eventType === "check_run" &&
      action === "completed"
    ) {
      const conclusion: string | undefined = payload.check_run?.conclusion;
      if (conclusion !== "failure" && conclusion !== "timed_out") continue;
    }

    // Rule matched — create an AutomationRun
    matched.push({
      id: crypto.randomUUID(),
      ruleId: rule.id,
      ruleName: rule.name,
      workflow: rule.workflow,
      eventId,
      status: "pending",
      startedAt: new Date().toISOString(),
    });
  }

  return matched;
}
