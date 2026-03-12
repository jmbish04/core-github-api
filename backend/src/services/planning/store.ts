import { and, desc, eq, like, or, type SQL } from "drizzle-orm";
import { getDb } from "@db";
import {
  planningRequestArtifacts,
  planningRequestEvents,
  projectPlanningRequests,
} from "@db/schemas/projects";
import type { PlanningRequestInput } from "@/lib/schemas/jules";

function toJson<T>(value: T | undefined | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
}

function fromJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function defaultTitle(payload: Pick<PlanningRequestInput, "workstream" | "prompt" | "projectName" | "githubRepo">): string {
  const basis =
    payload.projectName ||
    payload.githubRepo ||
    payload.prompt.slice(0, 80).trim() ||
    "Planning request";
  return `${payload.workstream.replace(/_/g, " ")}: ${basis}`.slice(0, 160);
}

export function serializePlanningRequest(
  row: typeof projectPlanningRequests.$inferSelect,
) {
  return {
    ...row,
    sourceContext: fromJson<Record<string, unknown> | null>(row.sourceContextJson, null),
    stitchScreenIds: fromJson<string[]>(row.stitchScreenIdsJson, []),
    metadata: fromJson<Record<string, unknown> | null>(row.metadataJson, null),
  };
}

export async function createPlanningRequest(
  env: Env,
  payload: PlanningRequestInput & {
    requestId: string;
    createdBy?: string | null;
    title?: string | null;
    requiresPlanApproval?: boolean;
    autoOrchestrate?: boolean;
    autoImplement?: boolean;
  },
) {
  const db = getDb(env.DB);
  await db.insert(projectPlanningRequests).values({
    id: payload.requestId,
    title: payload.title || defaultTitle(payload),
    projectId: payload.projectId,
    projectName: payload.projectName,
    workstream: payload.workstream,
    status: "queued",
    prompt: payload.prompt,
    sourceContextJson: toJson(payload.sourceContext || null),
    githubRepo: payload.githubRepo,
    baseBranch: payload.baseBranch,
    stitchProjectId: payload.stitchProjectId,
    stitchScreenIdsJson: toJson(payload.stitchScreenIds || []),
    requiresPlanApproval: payload.requiresPlanApproval ?? true,
    autoOrchestrate: payload.autoOrchestrate ?? payload.workstream !== "api_request",
    autoImplement: payload.autoImplement ?? payload.workstream === "stitch_implementation",
    createdBy: payload.createdBy || "api",
    metadataJson: toJson(payload.metadata || null),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return getPlanningRequest(env, payload.requestId);
}

export async function updatePlanningRequest(
  env: Env,
  requestId: string,
  values: Partial<typeof projectPlanningRequests.$inferInsert>,
) {
  const db = getDb(env.DB);
  await db
    .update(projectPlanningRequests)
    .set({
      ...values,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projectPlanningRequests.id, requestId));
}

export async function getPlanningRequest(env: Env, requestId: string) {
  const db = getDb(env.DB);
  const row = await db
    .select()
    .from(projectPlanningRequests)
    .where(eq(projectPlanningRequests.id, requestId))
    .get();

  return row ? serializePlanningRequest(row) : null;
}

export async function listPlanningRequests(
  env: Env,
  input: {
    q?: string;
    status?: string;
    workstream?: string;
    projectId?: string;
    projectName?: string;
    limit?: number;
  },
) {
  const db = getDb(env.DB);
  const whereClauses: Array<SQL<unknown> | undefined> = [];

  if (input.status) {
    whereClauses.push(eq(projectPlanningRequests.status, input.status));
  }

  if (input.workstream) {
    whereClauses.push(eq(projectPlanningRequests.workstream, input.workstream));
  }

  if (input.projectId) {
    whereClauses.push(eq(projectPlanningRequests.projectId, input.projectId));
  }

  if (input.projectName) {
    whereClauses.push(like(projectPlanningRequests.projectName, `%${input.projectName}%`));
  }

  if (input.q) {
    const q = `%${input.q}%`;
    whereClauses.push(
      or(
        like(projectPlanningRequests.title, q),
        like(projectPlanningRequests.prompt, q),
        like(projectPlanningRequests.projectName, q),
        like(projectPlanningRequests.githubRepo, q),
      ),
    );
  }

  const rows = await db
    .select()
    .from(projectPlanningRequests)
    .where(whereClauses.length ? and(...whereClauses.filter(Boolean) as SQL<unknown>[]) : undefined)
    .orderBy(desc(projectPlanningRequests.createdAt))
    .limit(Math.min(Math.max(input.limit || 25, 1), 100));

  return rows.map(serializePlanningRequest);
}

export async function createPlanningEvent(
  env: Env,
  input: {
    requestId: string;
    source: "api" | "workflow" | "jules" | "stitch" | "agent" | "system" | "user";
    eventType: string;
    title?: string | null;
    message?: string | null;
    payload?: unknown;
  },
) {
  const db = getDb(env.DB);
  const id = crypto.randomUUID();

  await db.insert(planningRequestEvents).values({
    id,
    requestId: input.requestId,
    source: input.source,
    eventType: input.eventType,
    title: input.title || null,
    message: input.message || null,
    payloadJson: toJson(input.payload),
    createdAt: new Date().toISOString(),
  });

  return id;
}

export async function listPlanningEvents(env: Env, requestId: string, limit = 200) {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(planningRequestEvents)
    .where(eq(planningRequestEvents.requestId, requestId))
    .orderBy(desc(planningRequestEvents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));

  return rows.map((row) => ({
    ...row,
    payload: fromJson<Record<string, unknown> | null>(row.payloadJson, null),
  }));
}

export async function createPlanningArtifact(
  env: Env,
  input: {
    requestId: string;
    artifactKind:
      | "jules_plan_markdown"
      | "jules_change_set"
      | "stitch_spec"
      | "stitch_image"
      | "orchestrated_plan_json"
      | "vector_document"
      | "github_plan_commit"
      | "github_pr";
    storageDriver: "d1" | "r2" | "vectorize" | "github";
    storageKey?: string | null;
    mimeType?: string | null;
    contentText?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  const db = getDb(env.DB);
  const id = crypto.randomUUID();
  await db.insert(planningRequestArtifacts).values({
    id,
    requestId: input.requestId,
    artifactKind: input.artifactKind,
    storageDriver: input.storageDriver,
    storageKey: input.storageKey || null,
    mimeType: input.mimeType || null,
    contentText: input.contentText || null,
    metadataJson: toJson(input.metadata || null),
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function listPlanningArtifacts(env: Env, requestId: string) {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(planningRequestArtifacts)
    .where(eq(planningRequestArtifacts.requestId, requestId))
    .orderBy(desc(planningRequestArtifacts.createdAt));

  return rows.map((row) => ({
    ...row,
    metadata: fromJson<Record<string, unknown> | null>(row.metadataJson, null),
  }));
}

export async function getPlanningArtifact(env: Env, requestId: string, artifactId: string) {
  const db = getDb(env.DB);
  const row = await db
    .select()
    .from(planningRequestArtifacts)
    .where(
      and(
        eq(planningRequestArtifacts.requestId, requestId),
        eq(planningRequestArtifacts.id, artifactId),
      ),
    )
    .get();

  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: fromJson<Record<string, unknown> | null>(row.metadataJson, null),
  };
}
