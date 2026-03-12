import { z } from "zod";

export const PlanningWorkstreamSchema = z.enum([
  "api_request",
  "project_planning",
  "integration_stitch",
  "stitch_implementation",
]);

export const PlanningRequestStatusSchema = z.enum([
  "queued",
  "running",
  "awaiting_stitch_approval",
  "awaiting_plan_approval",
  "approved",
  "revising",
  "orchestrating",
  "implementing",
  "completed",
  "rejected",
  "failed",
  "cancelled",
]);

export const SafeStringSchema = z
  .string()
  .min(1)
  .refine((value) => !/[\x00-\x1F]/.test(value), "Control characters are not allowed")
  .refine((value) => !value.includes("%"), "Pre-URL encoded strings are not allowed");

export const SafeRepoSchema = SafeStringSchema.refine(
  (value) => !value.includes("..") && !value.includes("?") && !value.includes("#"),
  "Invalid repo format",
).refine((value) => value.split("/").length === 2, "Repo must be owner/repo");

export const JulesCodingTaskInputSchema = z.object({
  prompt: SafeStringSchema.describe("Detailed instructions for the coding task."),
  githubRepo: SafeRepoSchema.optional().describe('Format "owner/repo". Omit for repoless session.'),
  baseBranch: SafeStringSchema.optional().default("main").describe('Defaults to "main".'),
  dryRun: z.boolean().default(false),
});

export const PlanningRequestInputSchema = JulesCodingTaskInputSchema.extend({
  workstream: PlanningWorkstreamSchema.default("project_planning"),
  projectId: SafeStringSchema.optional(),
  projectName: SafeStringSchema.optional(),
  stitchProjectId: SafeStringSchema.optional(),
  stitchScreenIds: z.array(SafeStringSchema).max(24).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((value, ctx) => {
  if (
    (value.workstream === "integration_stitch" ||
      value.workstream === "stitch_implementation") &&
    !value.stitchProjectId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "stitchProjectId is required for Stitch workstreams",
      path: ["stitchProjectId"],
    });
  }
});

export const PlanningApprovalInputSchema = z.object({
  approvedBy: SafeStringSchema.optional().default("user"),
  notes: SafeStringSchema.optional(),
});

export const JulesCodingTaskErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "REQUEST_NOT_FOUND",
  "SESSION_CREATE_FAILED",
  "APPROVAL_TIMEOUT",
  "ARTIFACT_UPLOAD_FAILED",
  "VECTORIZE_UPSERT_FAILED",
  "PLAN_DERIVATION_FAILED",
  "WORKFLOW_FAILED",
]);

export type PlanningWorkstream = z.infer<typeof PlanningWorkstreamSchema>;
export type PlanningRequestStatus = z.infer<typeof PlanningRequestStatusSchema>;
export type JulesCodingTaskInput = z.infer<typeof JulesCodingTaskInputSchema>;
export type PlanningRequestInput = z.infer<typeof PlanningRequestInputSchema>;
export type PlanningApprovalInput = z.infer<typeof PlanningApprovalInputSchema>;
export type JulesCodingTaskErrorCode = z.infer<typeof JulesCodingTaskErrorCodeSchema>;
