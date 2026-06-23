import { and, desc, eq, like, or, type SQL } from 'drizzle-orm';
import { getDb } from '@db';
import {
  reverseEngineeringBackend,
  reverseEngineeringEvents,
  reverseEngineeringSnapshots,
  reverseEngineeringUx,
} from '@/db/schemas/projects/plans/reverse_engineering';
import type {
  ReverseEngineeringAnalyzeInput,
  ReverseEngineeringListQuery,
  ReverseEngineeringStatus,
} from '@/lib/schemas/reverse-engineering';

function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function fromJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function createReverseEngineeringSnapshot(
  env: Env,
  input: ReverseEngineeringAnalyzeInput & {
    snapshotId: string;
    projectId?: string | null;
    githubOwner: string;
    githubRepo: string;
    repoUrl: string;
  },
) {
  const db = getDb(env.DB);
  await db.insert(reverseEngineeringSnapshots).values({
    id: input.snapshotId,
    projectId: input.projectId || null,
    githubOwner: input.githubOwner,
    githubRepo: input.githubRepo,
    repoUrl: input.repoUrl,
    branch: input.branch || 'main',
    frontendUrl: input.frontendUrl || null,
    status: 'pending',
    title: input.title || `${input.githubOwner}/${input.githubRepo}`,
    requestedAuthJson: toJson(input.auth || null),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return getReverseEngineeringSnapshot(env, input.snapshotId);
}

export async function updateReverseEngineeringSnapshot(
  env: Env,
  snapshotId: string,
  values: Partial<typeof reverseEngineeringSnapshots.$inferInsert>,
) {
  const db = getDb(env.DB);
  await db
    .update(reverseEngineeringSnapshots)
    .set({
      ...values,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(reverseEngineeringSnapshots.id, snapshotId));
}

export async function upsertReverseEngineeringUx(
  env: Env,
  snapshotId: string,
  values: Partial<typeof reverseEngineeringUx.$inferInsert>,
) {
  const db = getDb(env.DB);
  const existing = await db
    .select({ id: reverseEngineeringUx.id })
    .from(reverseEngineeringUx)
    .where(eq(reverseEngineeringUx.snapshotId, snapshotId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(reverseEngineeringUx)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(eq(reverseEngineeringUx.id, existing[0].id));
    return existing[0].id;
  }

  const id = crypto.randomUUID();
  await db.insert(reverseEngineeringUx).values({
    id,
    snapshotId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...values,
  });
  return id;
}

export async function upsertReverseEngineeringBackend(
  env: Env,
  snapshotId: string,
  values: Partial<typeof reverseEngineeringBackend.$inferInsert>,
) {
  const db = getDb(env.DB);
  const existing = await db
    .select({ id: reverseEngineeringBackend.id })
    .from(reverseEngineeringBackend)
    .where(eq(reverseEngineeringBackend.snapshotId, snapshotId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(reverseEngineeringBackend)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(eq(reverseEngineeringBackend.id, existing[0].id));
    return existing[0].id;
  }

  const id = crypto.randomUUID();
  await db.insert(reverseEngineeringBackend).values({
    id,
    snapshotId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...values,
  });
  return id;
}

export async function createReverseEngineeringEvent(
  env: Env,
  input: {
    snapshotId: string;
    eventType: string;
    title?: string;
    message?: string;
    payload?: unknown;
  },
) {
  const db = getDb(env.DB);
  const id = crypto.randomUUID();
  await db.insert(reverseEngineeringEvents).values({
    id,
    snapshotId: input.snapshotId,
    eventType: input.eventType,
    title: input.title || null,
    message: input.message || null,
    payloadJson: toJson(input.payload),
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function listReverseEngineeringEvents(env: Env, snapshotId: string) {
  const db = getDb(env.DB);
  const events = await db
    .select()
    .from(reverseEngineeringEvents)
    .where(eq(reverseEngineeringEvents.snapshotId, snapshotId))
    .orderBy(desc(reverseEngineeringEvents.createdAt))
    .limit(200);

  return events.map((event) => ({
    ...event,
    payload: fromJson<unknown>(event.payloadJson, null),
  }));
}

export async function getReverseEngineeringSnapshot(env: Env, snapshotId: string) {
  const db = getDb(env.DB);
  const snapshot = await db
    .select()
    .from(reverseEngineeringSnapshots)
    .where(eq(reverseEngineeringSnapshots.id, snapshotId))
    .get();
  if (!snapshot) return null;

  const ux = await db
    .select()
    .from(reverseEngineeringUx)
    .where(eq(reverseEngineeringUx.snapshotId, snapshotId))
    .get();
  const backend = await db
    .select()
    .from(reverseEngineeringBackend)
    .where(eq(reverseEngineeringBackend.snapshotId, snapshotId))
    .get();
  const events = await listReverseEngineeringEvents(env, snapshotId);

  return {
    ...snapshot,
    detectedStack: fromJson<Record<string, unknown> | null>(snapshot.detectedStackJson, null),
    previewResolution: fromJson<Record<string, unknown> | null>(snapshot.previewResolutionJson, null),
    frontendAuth: fromJson<Record<string, unknown> | null>(snapshot.frontendAuthJson, null),
    requestedAuth: fromJson<Record<string, unknown> | null>(snapshot.requestedAuthJson, null),
    screenshotUrls: fromJson<unknown[]>(snapshot.screenshotUrlsJson, []),
    epics: fromJson<unknown[]>(snapshot.epicsJson, []),
    userJourneys: fromJson<unknown[]>(snapshot.userJourneysJson, []),
    repoResearch: fromJson<Record<string, unknown> | null>(snapshot.repoResearchJson, null),
    julesResearch: fromJson<Record<string, unknown> | null>(snapshot.julesResearchJson, null),
    ux: ux
      ? {
          ...ux,
          pageAnalyses: fromJson<unknown[]>(ux.pageAnalysesJson, []),
          screenshotGallery: fromJson<unknown[]>(ux.screenshotGalleryJson, []),
          pageUserJourneys: fromJson<unknown[]>(ux.pageUserJourneysJson, []),
          visionAnalysis: fromJson<unknown>(ux.visionAnalysisJson, null),
          codeAnalysis: fromJson<unknown>(ux.codeAnalysisJson, null),
        }
      : null,
    backend: backend
      ? {
          ...backend,
          endpointInventory: fromJson<unknown[]>(backend.endpointInventoryJson, []),
          dataModel: fromJson<unknown>(backend.dataModelJson, null),
          integrations: fromJson<unknown[]>(backend.integrationsJson, []),
          authModel: fromJson<unknown>(backend.authModelJson, null),
          deploymentModel: fromJson<unknown>(backend.deploymentModelJson, null),
        }
      : null,
    events,
  };
}

export async function listReverseEngineeringSnapshots(env: Env, query: ReverseEngineeringListQuery) {
  const db = getDb(env.DB);
  const whereClauses: Array<SQL<unknown> | undefined> = [];

  if (query.status) whereClauses.push(eq(reverseEngineeringSnapshots.status, query.status));
  if (query.projectId) whereClauses.push(eq(reverseEngineeringSnapshots.projectId, query.projectId));
  if (query.q) {
    const q = `%${query.q}%`;
    whereClauses.push(
      or(
        like(reverseEngineeringSnapshots.githubOwner, q),
        like(reverseEngineeringSnapshots.githubRepo, q),
        like(reverseEngineeringSnapshots.title, q),
        like(reverseEngineeringSnapshots.repoUrl, q),
      ),
    );
  }

  const rows = await db
    .select()
    .from(reverseEngineeringSnapshots)
    .where(whereClauses.length ? and(...(whereClauses.filter(Boolean) as SQL<unknown>[])) : undefined)
    .orderBy(desc(reverseEngineeringSnapshots.createdAt))
    .limit(query.limit || 25);

  return rows.map((row) => ({
    ...row,
    detectedStack: fromJson<Record<string, unknown> | null>(row.detectedStackJson, null),
    previewResolution: fromJson<Record<string, unknown> | null>(row.previewResolutionJson, null),
    frontendAuth: fromJson<Record<string, unknown> | null>(row.frontendAuthJson, null),
    screenshotUrls: fromJson<unknown[]>(row.screenshotUrlsJson, []),
  }));
}

export async function markReverseEngineeringFailed(
  env: Env,
  snapshotId: string,
  message: string,
) {
  await updateReverseEngineeringSnapshot(env, snapshotId, {
    status: 'failed' satisfies ReverseEngineeringStatus,
    errorMessage: message,
  });
  await createReverseEngineeringEvent(env, {
    snapshotId,
    eventType: 'ERROR',
    title: 'Reverse engineering failed',
    message,
  });
}
