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
  // eslint-disable-next-line no-control-regex -- intentional: checks for ASCII control chars 0x00-0x1F
  .refine((value) => !new RegExp('[\x00-\x1F]').test(value), "Control characters are not allowed")
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
  requiresPlanApproval: z.boolean().optional().default(true),
  autoOrchestrate: z.boolean().optional(),
  autoImplement: z.boolean().optional(),
  sourceContext: z.record(z.string(), z.unknown()).optional(),
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

export const PlanningDecisionInputSchema = z.object({
  decision: z.enum(["approve", "revise", "reject"]),
  actedBy: SafeStringSchema.optional().default("user"),
  notes: SafeStringSchema.optional(),
});

export const PlanningDecisionActionSchema = z.object({
  actedBy: SafeStringSchema.optional().default("user"),
  notes: SafeStringSchema.optional(),
});

export const PlanningListQuerySchema = z.object({
  q: SafeStringSchema.optional(),
  status: PlanningRequestStatusSchema.optional(),
  workstream: PlanningWorkstreamSchema.optional(),
  projectId: SafeStringSchema.optional(),
  projectName: SafeStringSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export const PlanningSemanticQuerySchema = z.object({
  query: SafeStringSchema,
  requestId: SafeStringSchema.optional(),
  projectId: SafeStringSchema.optional(),
  projectName: SafeStringSchema.optional(),
  topK: z.coerce.number().int().min(1).max(25).optional().default(8),
}).superRefine((value, ctx) => {
  if (!value.requestId && !value.projectId && !value.projectName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "requestId, projectId, or projectName is required for semantic queries",
      path: ["requestId"],
    });
  }
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
export type PlanningDecisionInput = z.infer<typeof PlanningDecisionInputSchema>;
export type PlanningDecisionActionInput = z.infer<typeof PlanningDecisionActionSchema>;
export type PlanningListQuery = z.infer<typeof PlanningListQuerySchema>;
export type PlanningSemanticQuery = z.infer<typeof PlanningSemanticQuerySchema>;
export type JulesCodingTaskErrorCode = z.infer<typeof JulesCodingTaskErrorCodeSchema>;
