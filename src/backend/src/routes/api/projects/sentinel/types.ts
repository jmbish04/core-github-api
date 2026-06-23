/**
 * @file routes/api/projects/sentinel/types.ts
 * @description Shared Zod schemas and TypeScript types for the Sentinel API.
 *
 * All endpoint files import from here — single source of truth for request/response shapes.
 * Schemas are chained with .openapi('SchemaName') for OpenAPI v3.1.0 doc generation.
 */

import { z } from '@hono/zod-openapi';

// ─── Shared Enums ────────────────────────────────────────────────────────────

export const TaskStatusEnum = z.enum(['todo', 'in_progress', 'done', 'backlog', 'cancelled']);
export const KanbanColumnEnum = z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done']);
export const TaskPriorityEnum = z.enum(['low', 'medium', 'high', 'critical', 'urgent']);
export const TaskTypeEnum = z.enum(['task', 'bug', 'story', 'epic']);
export const TaskLabelEnum = z.enum(['bug', 'feature', 'documentation', 'improvement']);

/**
 * Hand-written Zod equivalent of `createSelectSchema(tasks)`.
 * We intentionally avoid importing drizzle-zod + the Drizzle table here because
 * the frontend imports this file via the @api alias — pulling Drizzle into the
 * Vite bundle breaks the build and violates the Data Layer Isolation rule.
 */
export const SentinelTaskSchema = z.object({
  id: z.string(),
  repoId: z.string(),
  parentId: z.string().nullable(),
  planRevisionId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  assignee: z.string().nullable(),
  position: z.number().nullable(),
  kanbanColumn: z.string(),
  githubIssueId: z.number().nullable(),
  githubHtmlUrl: z.string().nullable(),
  isDeleted: z.number().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
}).openapi('SentinelTask');

export type SentinelTask = z.infer<typeof SentinelTaskSchema>;

// ─── Tracker Item Schema (full response shape for frontend consumption) ──────

export const TrackerItemSchema = z.object({
    id: z.string(),
    type: TaskTypeEnum,
    title: z.string(),
    status: TaskStatusEnum,
    label: TaskLabelEnum,
    priority: TaskPriorityEnum,
    parentId: z.string().nullable(),
    assignee: z.string().nullable(),
    description: z.string().optional(),
    createdAt: z.string(),
}).openapi('TrackerItem');

export type TrackerItem = z.infer<typeof TrackerItemSchema>;

// ─── Create / Update / Import Schemas ────────────────────────────────────────

export const CreateTrackerItemSchema = z.object({
    title: z.string().min(1, 'Title is required.'),
    description: z.string().optional(),
    status: TaskStatusEnum.default('todo'),
    label: TaskLabelEnum.default('feature'),
    priority: TaskPriorityEnum.default('medium'),
    type: TaskTypeEnum.default('task'),
}).openapi('CreateTrackerItem');

export type CreateTrackerItemInput = z.infer<typeof CreateTrackerItemSchema>;

export const UpdateTrackerItemSchema = z.object({
    title: z.string().min(1, 'Title is required.').optional(),
    description: z.string().optional(),
    status: TaskStatusEnum.optional(),
    label: TaskLabelEnum.optional(),
    priority: TaskPriorityEnum.optional(),
    type: TaskTypeEnum.optional(),
    kanbanColumn: KanbanColumnEnum.optional(),
    notes: z.string().optional(),
}).openapi('UpdateTrackerItem');

export type UpdateTrackerItemInput = z.infer<typeof UpdateTrackerItemSchema>;

export const ImportTrackerItemsSchema = z.object({
    payload: z.string().min(1, 'Please enter some data to import'),
}).openapi('ImportTrackerItems');

export type ImportTrackerItemsInput = z.infer<typeof ImportTrackerItemsSchema>;

// ─── Form Validation Schema (reused by frontend zodResolver) ─────────────────

export const TrackerItemFormSchema = z.object({
    title: z.string().min(1, 'Title is required.'),
    description: z.string().optional(),
    status: z.string().min(1, 'Please select a status.'),
    label: z.string().min(1, 'Please select a label.'),
    priority: z.string().min(1, 'Please select a priority.'),
    type: TaskTypeEnum.describe('Please select a type.'),
}).openapi('TrackerItemForm');

export type TrackerItemFormValues = z.infer<typeof TrackerItemFormSchema>;

export const SentinelTaskWithContextSchema = SentinelTaskSchema.extend({
    story: z.object({ id: z.string(), title: z.string() }).nullable().optional(),
    epic: z.object({ id: z.string(), title: z.string() }).nullable().optional(),
});

export type SentinelTaskWithContext = z.infer<typeof SentinelTaskWithContextSchema>;

// ─── Query Params ─────────────────────────────────────────────────────────────

export const TaskAvailableQuerySchema = z.object({
    repoId: z.string().optional(),
    limit: z.coerce.number().default(20),
    offset: z.coerce.number().default(0),
});

// ─── Request Bodies ───────────────────────────────────────────────────────────

export const ClaimTaskBodySchema = z.object({
    assignee: z.string().min(1, 'Assignee is required (e.g. jules:session-abc123)'),
});

export const UpdateTaskBodySchema = z.object({
    status: TaskStatusEnum.optional(),
    notes: z.string().optional(),
    kanbanColumn: KanbanColumnEnum.optional(),
    description: z.string().optional(),
    title: z.string().optional(),
    type: TaskTypeEnum.optional(),
    label: TaskLabelEnum.optional(),
    priority: TaskPriorityEnum.optional(),
}).openapi('UpdateTaskBody');

export const SubmitTaskBodySchema = z.object({
    notes: z.string().optional(),
});

export const ClarifyTaskBodySchema = z.object({
    question: z.string().min(1, 'Question is required'),
});

export const IngestInsightBodySchema = z.object({
    repoId: z.string(),
    patternType: z.string().describe('E.g. doom_loop, apology_cycle, schema_drift'),
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    sourceSessionId: z.string().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
});

// ─── WebSocket Message Types ──────────────────────────────────────────────────

export const WsSubscribeMessageSchema = z.object({
    type: z.literal('subscribe'),
    projectId: z.string(),
});

export const WsPingMessageSchema = z.object({
    type: z.literal('ping'),
});

export const WsSystemOverrideMessageSchema = z.object({
    type: z.literal('system_override'),
    sessionId: z.string(),
    message: z.string(),
});

export const WsMessageSchema = z.discriminatedUnion('type', [
    WsSubscribeMessageSchema,
    WsPingMessageSchema,
    WsSystemOverrideMessageSchema,
]);

export type WsMessage = z.infer<typeof WsMessageSchema>;

// ─── Response Shapes ──────────────────────────────────────────────────────────

export const OkResponseSchema = z.object({
    ok: z.boolean(),
    message: z.string().optional(),
});

export const ErrorResponseSchema = z.object({
    ok: z.literal(false),
    error: z.string(),
});
