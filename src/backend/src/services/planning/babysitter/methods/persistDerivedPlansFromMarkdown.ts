import type { PlanningWorkstream } from "@/lib/schemas/jules";
import { derivePlanBreakdownFromMarkdown } from "./derivePlanBreakdownFromMarkdown";
import { persistPlanBreakdown } from "./persistPlanBreakdown";
import { PlanningBreakdown } from "../types";

export async function persistDerivedPlansFromMarkdown(
  env: Env,
  input: {
    requestId: string;
    workstream: PlanningWorkstream;
    markdown: string;
    projectId?: string;
    projectName?: string;
  },
): Promise<PlanningBreakdown> {
  const breakdown = await derivePlanBreakdownFromMarkdown(env, input);
  await persistPlanBreakdown(env, input, breakdown);
  return breakdown;
}
