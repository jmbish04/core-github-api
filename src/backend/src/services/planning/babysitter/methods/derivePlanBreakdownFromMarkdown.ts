import { AIProvider } from "@/ai/providers";
import type { PlanningWorkstream } from "@/lib/schemas/jules";
import { zodToJsonSchema } from "zod-to-json-schema";
import { PlanningBreakdown, PlanningBreakdownSchema } from "../types";
import { normalizeBreakdown } from "../utils";

export async function derivePlanBreakdownFromMarkdown(
  env: Env,
  input: {
    requestId: string;
    workstream: PlanningWorkstream;
    markdown: string;
    projectId?: string;
    projectName?: string;
  },
): Promise<PlanningBreakdown> {
  const prompt = [
    `Request ID: ${input.requestId}`,
    `Workstream: ${input.workstream}`,
    input.projectId ? `Project ID: ${input.projectId}` : null,
    input.projectName ? `Project Name: ${input.projectName}` : null,
    "",
    "Transform the markdown plan below into implementation-ready epics, stories, and tasks.",
    "Each task should be concrete, preserve Cloudflare-specific requirements, and include docs queries when Cloudflare platform details matter.",
    "Your output MUST be robust JSON matching this exact schema:",
    JSON.stringify(zodToJsonSchema(PlanningBreakdownSchema as any, 'planning_breakdown'), null, 2),
    "",
    input.markdown,
  ]
    .filter(Boolean)
    .join("\n");

  const ai = new AIProvider(env);
  const raw = await ai.generateStructuredResponse<PlanningBreakdown>(
    prompt,
    PlanningBreakdownSchema,
    "Return only JSON for an implementation breakdown of the provided plan.",
  );

  return normalizeBreakdown(input.markdown, PlanningBreakdownSchema.parse(raw));
}
