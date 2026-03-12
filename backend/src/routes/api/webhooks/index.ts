import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, like, sql, and, inArray, gte, lte, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

// Internal schema & database imports
import { getGitHubPrivateKey, getGitHubAppId, getGitHubWebhookSecret } from "@utils/secrets";
import { generateUuid } from "@/utils/common";
interface DONamespace {
  idFromName(name: string): unknown;
  get(id: unknown): unknown;
}
function getAgentByName(namespace: unknown, name: string) {
  const ns = namespace as DONamespace;
  const id = ns.idFromName(name);
  return ns.get(id);
}
import { getWebhooksDb } from '@db';
import { webhookDeliveries } from '@/db/schemas/github/webhooks';

// Types & Services
import type { GitHubWebhookPayload } from '@/types/github/webhooks';
import { App } from 'octokit';
import { sanitizeRepoName } from '@/ai/mcp/tools/sandbox-sdk';
import { AutomationRegistry } from '@/automations/core/AutomationRegistry';

const webhooksApi = new Hono<{ Bindings: Env }>();

/**
 * Unified GitHub Webhook Handler
 */
export async function webhookHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const deliveryId = c.req.header('x-github-delivery');
  const eventName = c.req.header('x-github-event');
  const signature = c.req.header('x-hub-signature-256');
  const userAgent = c.req.header('user-agent');
  const contentType = c.req.header('content-type');
  const hookId = c.req.header('x-github-hook-id');
  const installationTargetId = c.req.header('x-github-hook-installation-target-id');
  const installationTargetType = c.req.header('x-github-hook-installation-target-type');

  if (!deliveryId || !eventName || !signature) {
    return c.json({ error: 'Missing required headers' }, 400);
  }

  const privateKey = await getGitHubPrivateKey(c.env);
  const appId = await getGitHubAppId(c.env);
  const webhookSecret = await getGitHubWebhookSecret(c.env);

  if (!privateKey || !appId || !webhookSecret) {
    console.error('Missing GitHub App configuration');
    return c.json({ error: 'Server misconfiguration' }, 500);
  }

  const rawBody = await c.req.text();

  try {
    const app = new App({
      appId: appId,
      privateKey: privateKey,
      webhooks: {
        secret: webhookSecret
      }
    });

    await app.webhooks.verifyAndReceive({
      id: deliveryId,
      name: eventName as never, // Avoid union complexity here
      payload: rawBody,
      signature: signature,
    });
  } catch (error) {
    console.error('Webhook verification failed', error);
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const payload = JSON.parse(rawBody) as GitHubWebhookPayload & {
    repository?: { full_name?: string; owner?: { login?: string }; name?: string };
    installation?: { id?: number; account?: { login?: string } };
    pull_request?: { number?: number };
    issue?: { number?: number };
    action?: string;
  } & Record<string, unknown>;
  const action = payload.action || null;
  const repoFullName = payload.repository?.full_name;
  const installationId = payload.installation?.id || (installationTargetId ? parseInt(installationTargetId) : undefined);

  // Agent Dispatching (Kept isolated as per earlier design)
  if (repoFullName && c.env.REPO_AGENT) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const getByName = getAgentByName as unknown as (className: string, name: string) => Promise<{ fetch: (url: string, init: unknown) => Promise<Response> }>;
          const repoAgent = await getByName(
            c.env.REPO_AGENT as unknown as string,
            sanitizeRepoName(repoFullName)
          );
          await repoAgent.fetch("http://repo-agent/webhook", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-github-event": eventName,
              ...(signature ? { "x-hub-signature-256": signature } : {}),
            },
            body: rawBody,
          });
        } catch (error) {
          console.error('[RepoAgent] Failed to dispatch webhook:', error);
        }
      })()
    );
  }

  if (c.env.OWNER_AGENT) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const ownerKey =
            payload.repository?.owner?.login ||
            (payload as { installation?: { account?: { login?: string } } }).installation?.account?.login ||
            (c.env as { GITHUB_OWNER?: string }).GITHUB_OWNER ||
            'default-owner';
          const getByName = getAgentByName as unknown as (className: string, name: string) => Promise<{ fetch: (url: string, init: unknown) => Promise<Response> }>;
          const ownerAgent = await getByName(
            c.env.OWNER_AGENT as unknown as string,
            sanitizeRepoName(ownerKey)
          );
          await ownerAgent.fetch('http://owner-agent/webhook', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-github-event': eventName,
            },
            body: rawBody,
          });
        } catch (error) {
          console.error('[OwnerAgent] Failed to dispatch webhook:', error);
        }
      })()
    );
  }

  // Idempotency & DB Storage check
  const dbWebhooks = getWebhooksDb(c.env.DB_WEBHOOKS);
  const existing = await dbWebhooks.select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(sql`${webhookDeliveries.delivery_id} = ${deliveryId}`)
    .get();

  if (existing) {
    console.log(`[Webhook] Duplicate delivery ${deliveryId}, skipping.`);
    return c.json({ success: true, delivery_id: deliveryId, status: 'already_processed' });
  }

  try {
    // Basic unconfigured insertion of the delivery hook log
    await dbWebhooks.insert(webhookDeliveries).values({
      id: generateUuid(),
      delivery_id: deliveryId,
      event: eventName,
      action: action || null,
      repo_full_name: repoFullName || null,
      signature_sha256: signature,
      user_agent: userAgent || null,
      content_type: contentType || null,
      payload: payload as Record<string, unknown>,
      summary_payload: 'Replaced by Automation Log in D1.', 
      hook_id: hookId ? parseInt(hookId) : null,
      installation_id: installationId || null,
      installation_type: installationTargetType || null,
      created_at: new Date().toISOString()
    });

    c.executionCtx.waitUntil(
      AutomationRegistry.dispatch({
        env: c.env,
        payload,
        deliveryId,
        eventName,
        action,
        installationId,
        requestContext: c,
      }).then((results) => {
        const failures = results.filter((result) => result.status === 'rejected').length;
        if (failures > 0) {
          console.error(`[Webhook] ${failures} automations failed for delivery ${deliveryId}`);
        }
      })
    );
    return c.json({ success: true, delivery_id: deliveryId });

  } catch (error: unknown) {
    console.error('Failed to process webhook', error);
    return c.json({ error: 'Processing error', details: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}

// ==========================================
// POST / : GitHub Webhook Sync Listener
// ==========================================
webhooksApi.post('/', (c) => webhookHandler(c));

// ==========================================
// GET / : List Webhooks with Advanced Filters
// ==========================================
const QuerySchema = z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('20'),
    type: z.string().optional(),
    action: z.string().optional(),
    repo: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    search: z.string().optional(),
});

webhooksApi.get('/', zValidator('query', QuerySchema), async (c) => {
    const db = drizzle(c.env.DB_WEBHOOKS);
    const { page, limit, search, type, action, repo, from, to } = c.req.valid('query');
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const conditions: import('drizzle-orm').SQL[] = [];

    if (search) {
        const searchCondition = or(
            like(webhookDeliveries.payload, `%${search}%`),
            like(webhookDeliveries.summary_payload, `%${search}%`)
        );
        if (searchCondition) {
            conditions.push(searchCondition);
        }
    }

    if (type && type !== 'all') {
        const events = type.split(',').map(e => e.trim());
        conditions.push(events.length > 1 ? inArray(webhookDeliveries.event, events) : eq(webhookDeliveries.event, events[0]));
    }

    if (action && action !== 'all') conditions.push(eq(webhookDeliveries.action, action));
    if (repo) conditions.push(like(webhookDeliveries.repo_full_name, `%${repo}%`));
    if (from) conditions.push(gte(webhookDeliveries.created_at, from));
    if (to) conditions.push(lte(webhookDeliveries.created_at, to));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalQuery = db.select({ count: sql<number>`count(*)` }).from(webhookDeliveries);
    const totalResult = await (whereClause ? totalQuery.where(whereClause!) : totalQuery).get();
    const total = totalResult?.count || 0;

    let results: typeof webhookDeliveries.$inferSelect[] = [];
    if (total > 0) {
        let listQuery = db.select().from(webhookDeliveries).$dynamic();
        if (whereClause) {
            listQuery = listQuery.where(whereClause!);
        }
        results = await listQuery
            .orderBy(desc(webhookDeliveries.created_at))
            .limit(limitNum)
            .offset(offset)
            .all();
    }

    const distinctRepos = await db.selectDistinct({ repo_full_name: webhookDeliveries.repo_full_name })
        .from(webhookDeliveries).where(sql`${webhookDeliveries.repo_full_name} IS NOT NULL`).orderBy(webhookDeliveries.repo_full_name).limit(50).all();

    const distinctActions = await db.selectDistinct({ action: webhookDeliveries.action })
        .from(webhookDeliveries).where(sql`${webhookDeliveries.action} IS NOT NULL`).orderBy(webhookDeliveries.action).limit(50).all();

    return c.json({
        data: results,
        filters: {
            repos: distinctRepos.map(r => r.repo_full_name).filter(Boolean),
            actions: distinctActions.map(a => a.action).filter(Boolean),
        },
        pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) || 1 }
    });
});

// ==========================================
// GET /stats : Webhook Delivery Analytics
// ==========================================
webhooksApi.get('/stats', async (c) => {
    const db = drizzle(c.env.DB_WEBHOOKS);
    const [total, recent] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(webhookDeliveries).get(),
        db.select({ count: sql<number>`count(*)` }).from(webhookDeliveries).where(sql`created_at > datetime('now', '-24 hours')`).get()
    ]);
    const topEvents = await db.select({ event: webhookDeliveries.event, count: sql<number>`count(*)` })
    .from(webhookDeliveries).groupBy(webhookDeliveries.event).orderBy(desc(sql`count(*)`)).limit(10).all();

    return c.json({ total: total?.count || 0, recent24h: recent?.count || 0, topEvents });
});

export default webhooksApi;
