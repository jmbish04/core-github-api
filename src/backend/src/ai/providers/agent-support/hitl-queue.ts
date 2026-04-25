import { getDb } from '@/db';
import { hitlQueue } from '@/db/schemas/workflows/hitl';
import { eq } from 'drizzle-orm';

export interface ProposeParams {
  workflowId: string;
  category: string;
  entityId?: string;
  proposedPayload: any;
  contextMetadata: any;
  /** Fleet-wide proposal routing — which repo type should the approved fix target */
  proposalTarget?: 'template-repo' | 'guardrail-rules' | 'core-github-api' | 'worker-specific';
  /** The specific worker this proposal addresses */
  targetWorkerName?: string;
  /** Full repo name (owner/repo) for worker-specific proposals */
  targetRepoFullName?: string;
}

export class HitlQueue {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  public async propose(params: ProposeParams): Promise<string> {
    if (!this.env.DB) throw new Error("DB not configured");
    const db = getDb(this.env.DB);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(hitlQueue).values({
      id,
      workflowId: params.workflowId,
      category: params.category,
      entityId: params.entityId,
      proposedPayload: params.proposedPayload,
      contextMetadata: params.contextMetadata,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      // Fleet-wide routing fields (nullable — backward-compatible)
      proposalTarget: params.proposalTarget ?? null,
      targetWorkerName: params.targetWorkerName ?? null,
      targetRepoFullName: params.targetRepoFullName ?? null,
      proposalTargetLocked: 0,
    });

    return id;
  }

  public async approve(id: string, feedback?: string): Promise<void> {
    if (!this.env.DB) throw new Error("DB not configured");
    const db = getDb(this.env.DB);
    const now = new Date().toISOString();

    await db.update(hitlQueue).set({
      status: 'approved',
      humanFeedback: feedback || null,
      updatedAt: now
    }).where(eq(hitlQueue.id, id));
  }

  public async reject(id: string, feedback?: string): Promise<void> {
    if (!this.env.DB) throw new Error("DB not configured");
    const db = getDb(this.env.DB);
    const now = new Date().toISOString();

    await db.update(hitlQueue).set({
      status: 'rejected',
      humanFeedback: feedback || null,
      updatedAt: now
    }).where(eq(hitlQueue.id, id));
  }

  public async iterate(id: string, feedback?: string): Promise<void> {
    if (!this.env.DB) throw new Error("DB not configured");
    const db = getDb(this.env.DB);
    const now = new Date().toISOString();

    // iterate essentially re-opens the item or leaves it pending with new feedback
    await db.update(hitlQueue).set({
      status: 'pending',
      humanFeedback: feedback || null,
      updatedAt: now
    }).where(eq(hitlQueue.id, id));
  }

  public async list(workflowId?: string) {
    if (!this.env.DB) throw new Error("DB not configured");
    const db = getDb(this.env.DB);
    if (workflowId) {
      return db.select().from(hitlQueue).where(eq(hitlQueue.workflowId, workflowId));
    }
    return db.select().from(hitlQueue);
  }

  public async get(id: string) {
    if (!this.env.DB) throw new Error("DB not configured");
    const db = getDb(this.env.DB);
    const results = await db.select().from(hitlQueue).where(eq(hitlQueue.id, id));
    return results[0] || null;
  }
}
