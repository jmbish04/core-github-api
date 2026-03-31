import { z } from 'zod';

export const ReverseEngineeringStatusSchema = z.enum([
  'pending',
  'running',
  'awaiting_auth',
  'complete',
  'failed',
]);

export const ReverseEngineeringCookieSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  domain: z.string().optional(),
  path: z.string().optional().default('/'),
  secure: z.boolean().optional(),
  httpOnly: z.boolean().optional(),
});

export const ReverseEngineeringAuthSchema = z.object({
  type: z.enum(['bearer_header', 'custom_header', 'basic_auth', 'cookie', 'query_param']).optional(),
  headerName: z.string().optional(),
  headerValue: z.string().optional(),
  queryParamName: z.string().optional(),
  queryParamValue: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  cookies: z.array(ReverseEngineeringCookieSchema).optional(),
  notes: z.string().optional(),
});

export const ReverseEngineeringAnalyzeInputSchema = z
  .object({
    repoUrl: z.string().url().optional(),
    githubRepo: z.string().regex(/^[^/]+\/[^/]+$/).optional(),
    owner: z.string().optional(),
    repo: z.string().optional(),
    branch: z.string().optional().default('main'),
    frontendUrl: z.string().url().optional(),
    auth: ReverseEngineeringAuthSchema.optional(),
    projectId: z.string().optional(),
    useSandboxPreview: z.boolean().optional().default(true),
    title: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.repoUrl && !value.githubRepo && !(value.owner && value.repo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['githubRepo'],
        message: 'Provide repoUrl, githubRepo, or owner + repo.',
      });
    }
  });

export const ReverseEngineeringResumeInputSchema = z.object({
  auth: ReverseEngineeringAuthSchema,
  frontendUrl: z.string().url().optional(),
});

export const ReverseEngineeringConsultRoleSchema = z.enum([
  'general',
  'product',
  'ux',
  'frontend',
  'backend',
  'cloudflare',
]);

export const ReverseEngineeringListQuerySchema = z.object({
  q: z.string().optional(),
  status: ReverseEngineeringStatusSchema.optional(),
  projectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export const ReverseEngineeringConsultInputSchema = z.object({
  message: z.string().min(1),
  role: ReverseEngineeringConsultRoleSchema.optional().default('general'),
  sessionId: z.string().optional(),
  model: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
      }),
    )
    .optional()
    .default([]),
});

export const ReverseEngineeringSnapshotParamsSchema = z.object({
  id: z.string().min(1),
});

export const ReverseEngineeringEventSchema = z.object({
  id: z.string().optional(),
  snapshotId: z.string(),
  eventType: z.string().optional(),
  type: z.string().optional(),
  title: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  ts: z.string().optional(),
  payload: z.unknown().optional(),
});

export const ReverseEngineeringPageAnalysisSchema = z.object({
  route: z.string(),
  filePath: z.string().nullable().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  codeAnalysis: z.string().optional(),
  visionAnalysis: z.string().optional(),
  components: z
    .array(
      z.object({
        type: z.string(),
        label: z.string().optional(),
        description: z.string(),
      }),
    )
    .optional(),
  perceivedFunctionality: z.array(z.string()).optional(),
  userJourney: z.array(z.string()).optional(),
});

export const ReverseEngineeringScreenshotGallerySchema = z.object({
  route: z.string(),
  filePath: z.string().nullable().optional(),
  resolvedUrl: z.string().optional(),
  imageId: z.string().nullable().optional(),
  screenshotUrls: z.array(z.string()).optional(),
  visionDescription: z.string().nullable().optional(),
});

export const ReverseEngineeringUxSchema = z.object({
  overallDescription: z.string().nullable().optional(),
  pageAnalyses: z.array(ReverseEngineeringPageAnalysisSchema).optional(),
  screenshotGallery: z.array(ReverseEngineeringScreenshotGallerySchema).optional(),
  pageUserJourneys: z.array(z.unknown()).optional(),
  visionAnalysis: z.unknown().optional(),
  codeAnalysis: z.unknown().optional(),
});

export const ReverseEngineeringBackendSchema = z.object({
  architectureMarkdown: z.string().nullable().optional(),
  endpointInventory: z
    .array(
      z.object({
        method: z.string(),
        path: z.string(),
        filePath: z.string(),
      }),
    )
    .optional(),
  dataModel: z.unknown().optional(),
  integrations: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
      }),
    )
    .optional(),
  authModel: z.unknown().optional(),
  deploymentModel: z.unknown().optional(),
});

export const ReverseEngineeringListItemSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable().optional(),
  githubOwner: z.string(),
  githubRepo: z.string(),
  repoUrl: z.string(),
  branch: z.string(),
  frontendUrl: z.string().nullable().optional(),
  resolvedPreviewUrl: z.string().nullable().optional(),
  status: ReverseEngineeringStatusSchema,
  title: z.string().nullable().optional(),
  detectedStack: z.record(z.string(), z.unknown()).nullable().optional(),
  previewResolution: z.record(z.string(), z.unknown()).nullable().optional(),
  frontendAuth: z.record(z.string(), z.unknown()).nullable().optional(),
  screenshotUrls: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  completedAt: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
});

export const ReverseEngineeringSnapshotDetailSchema = ReverseEngineeringListItemSchema.extend({
  requestedAuth: z.record(z.string(), z.unknown()).nullable().optional(),
  prdMarkdown: z.string().nullable().optional(),
  epics: z.array(z.unknown()).optional(),
  userJourneys: z.array(z.unknown()).optional(),
  repoResearch: z.record(z.string(), z.unknown()).nullable().optional(),
  julesResearch: z.record(z.string(), z.unknown()).nullable().optional(),
  ux: ReverseEngineeringUxSchema.nullable().optional(),
  backend: ReverseEngineeringBackendSchema.nullable().optional(),
  events: z.array(ReverseEngineeringEventSchema).optional(),
});

export const ReverseEngineeringAnalyzeResponseSchema = z.object({
  success: z.literal(true),
  snapshotId: z.string(),
  snapshot: ReverseEngineeringSnapshotDetailSchema.nullable(),
  projectId: z.string().nullable().optional(),
  repoId: z.string().optional(),
  detailUrl: z.string(),
  websocketUrl: z.string(),
  consultantUrl: z.string(),
});

export const ReverseEngineeringSnapshotResponseSchema = z.object({
  success: z.literal(true),
  snapshot: ReverseEngineeringSnapshotDetailSchema,
});

export const ReverseEngineeringListResponseSchema = z.object({
  success: z.literal(true),
  snapshots: z.array(ReverseEngineeringListItemSchema),
});

export const ReverseEngineeringEventsResponseSchema = z.object({
  success: z.literal(true),
  events: z.array(ReverseEngineeringEventSchema),
});

export const ReverseEngineeringResumeResponseSchema = z.object({
  success: z.literal(true),
  snapshotId: z.string(),
  resumed: z.literal(true),
});

export const ReverseEngineeringConsultResponseSchema = z.object({
  success: z.literal(true),
  response: z.string(),
  blocks: z.array(z.unknown()).optional(),
  followupPrompts: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
  modelUsed: z.string().optional(),
  state: z.unknown().optional(),
});

export const ReverseEngineeringErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export type ReverseEngineeringStatus = z.infer<typeof ReverseEngineeringStatusSchema>;
export type ReverseEngineeringAnalyzeInput = z.infer<typeof ReverseEngineeringAnalyzeInputSchema>;
export type ReverseEngineeringResumeInput = z.infer<typeof ReverseEngineeringResumeInputSchema>;
export type ReverseEngineeringListQuery = z.infer<typeof ReverseEngineeringListQuerySchema>;
export type ReverseEngineeringConsultInput = z.infer<typeof ReverseEngineeringConsultInputSchema>;
export type ReverseEngineeringAuthInput = z.infer<typeof ReverseEngineeringAuthSchema>;
export type ReverseEngineeringConsultRole = z.infer<typeof ReverseEngineeringConsultRoleSchema>;
