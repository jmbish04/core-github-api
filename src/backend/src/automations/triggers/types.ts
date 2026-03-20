import { generateUuid } from "@/utils/common";

export type AutomationRule = {
  id: string;
  name: string;
  description: string;
  trigger: {
    event: string;
    action?: string;
    branch?: string;
  };
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

export type TriggerPayload = Record<string, any>;

export function createPendingAutomationRun(
  rule: AutomationRule,
  eventId: string,
): AutomationRun {
  return {
    id: generateUuid(),
    ruleId: rule.id,
    ruleName: rule.name,
    workflow: rule.workflow,
    eventId,
    status: "pending",
    startedAt: new Date().toISOString(),
  };
}

