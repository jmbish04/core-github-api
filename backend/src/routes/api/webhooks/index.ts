import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, like, sql, and, inArray, gte, lte, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

// Internal schema & database imports
import { getWebhooksDb } from '@db';
import { webhookDeliveries } from '@/db/schemas/github/webhooks';

// Types & Services
import type { GitHubWebhookPayload } from '@/types/github/webhooks';
import { App } from 'octokit';
import { sanitizeRepoName } from '@/ai/mcp/tools/sandbox-sdk';
import { matchAutomations, DEFAULT_AUTOMATION_RULES } from "@/config/webhook-conditionals";
import { ensureRepositoryFromWebhook } from "@services/repository-sync";
import { getGitHubPrivateKey, getGitHubAppId, getGitHubWebhookSecret } from "@utils/secrets";
import { StandardizationService } from "@/services/standardization";
import { generateUuid } from "@/utils/common";
import { summarizeWebhookPayload } from "@/utils/webhook-summary";
import { getAgentByName } from 'agents';

// Handlers
import { handlePullRequest } from './handlers/pull-request';
import { handlePullRequestReview } from './handlers/pull-request-review';
import { handleIssues } from './handlers/issues';
import { handlePush } from './handlers/push';
import { handleRepository } from './handlers/repository';
import { handleCheckRun } from './handlers/check-run';
import { handleAlerts } from './handlers/alerts';
import { handleMiscellaneous } from './handlers/miscellaneous';
import type { WebhookHandlerContext } from './types';

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
      name: eventName as any,
      payload: rawBody,
      signature: signature,
    });
  } catch (error) {
    console.error('Webhook verification failed', error);
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const payload = JSON.parse(rawBody) as GitHubWebhookPayload & Record<string, any>;
  const action = payload.action;
  const repoFullName = payload.repository?.full_name;

  // Background Syncs
  if (payload.repository) {
    c.executionCtx.waitUntil(
      ensureRepositoryFromWebhook(c.env, payload.repository).catch((error) => {
        console.error('[RepositorySync] Failed to upsert repository from webhook:', error);
      })
    );

    c.executionCtx.waitUntil(
        StandardizationService.enforce(c.env, payload.repository).catch((error) => {
            console.error('[Standardization] Failed to enforce standards:', error);
        })
    );
  }

  // Agent Dispatching
  if (repoFullName && c.env.REPO_AGENT) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const getByName = getAgentByName as any;
          const repoAgent = await getByName(
            c.env.REPO_AGENT,
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
            (payload as any).installation?.account?.login ||
            (c.env as any).GITHUB_OWNER ||
            'default-owner';
          const getByName = getAgentByName as any;
          const ownerAgent = await getByName(
            c.env.OWNER_AGENT,
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

    c.executionCtx.waitUntil(
      (async () => {
        try {
          const dbMain = getWebhooksDb(c.env.DB_WEBHOOKS as any); // Or getDb(env.DB), wait, automationRules requires getDb(c.env.DB). I need to import getDb
          
          // Let's use getDb(c.env.DB) to fetch rules
          // Since getDb is imported at line 9 wait, is it?
          // `import { getWebhooksDb } from '@db';` is imported. I will use getDb.
          // Wait, actually `import { getDb, getWebhooksDb } from '@db';`
          const { getDb } = await import('@db');
          const { automationRules } = await import('@/db/schemas/app/automation_rules');
          const activeRules = await getDb(c.env.DB).select().from(automationRules).where(eq(automationRules.isActive, true)).all();
          
          const dbRules = activeRules.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            trigger: {
              event: r.triggerEvent,
              action: r.triggerAction || undefined,
              branch: r.triggerBranch || undefined
            },
            workflow: r.workflow
          }));

          const automationEventId = deliveryId;
          const runs = matchAutomations([...dbRules, ...DEFAULT_AUTOMATION_RULES], eventName, automationEventId, payload);
          if (runs.length > 0) {
            const ownerKey =
              payload.repository?.owner?.login ||
              (c.env as any).GITHUB_OWNER ||
              'default-owner';
            const getByName = getAgentByName as any;
            const ownerAgent = await getByName(
              c.env.OWNER_AGENT,
              sanitizeRepoName(ownerKey)
            );
            for (const run of runs) {
              await ownerAgent.fetch('http://owner-agent/store-automation', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(run),
              });
            }
          }
        } catch (error) {
          console.error('[AutomationRegistry] Failed to check automations:', error);
        }
      })()
    );
  }

  // Idempotency & DB Storage
  const db = getWebhooksDb(c.env.DB_WEBHOOKS);
  const existing = await db.select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(sql`${webhookDeliveries.delivery_id} = ${deliveryId}`)
    .get();

  if (existing) {
    console.log(`[Webhook] Duplicate delivery ${deliveryId}, skipping.`);
    return c.json({ success: true, delivery_id: deliveryId, status: 'already_processed' });
  }

  try {
    const { getDb } = await import('@db');
    const { automationRules } = await import('@/db/schemas/app/automation_rules');
    const activeRules = await getDb(c.env.DB).select().from(automationRules).where(eq(automationRules.isActive, true)).all();
    const dbRules = activeRules.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        trigger: {
          event: r.triggerEvent,
          action: r.triggerAction || undefined,
          branch: r.triggerBranch || undefined
        },
        workflow: r.workflow
    }));

    await db.insert(webhookDeliveries).values({
      id: generateUuid(),
      delivery_id: deliveryId,
      event: eventName,
      action: action || null,
      repo_full_name: repoFullName || null,
      signature_sha256: signature,
      user_agent: userAgent || null,
      content_type: contentType || null,
      payload: payload,
      summary_payload: summarizeWebhookPayload(payload, eventName, [...dbRules, ...DEFAULT_AUTOMATION_RULES]),
      hook_id: hookId ? parseInt(hookId) : null,
      installation_id: installationTargetId ? parseInt(installationTargetId) : null,
      installation_type: installationTargetType || null,
      created_at: new Date().toISOString()
    });

    const insertPayload = async (table: any, specificFields: any) => {
      await db.insert(table).values({
        delivery_id: deliveryId,
        payload: payload,
        ...specificFields
      });
    };

    const handlerContext: WebhookHandlerContext = {
      c,
      payload,
      eventName,
      action,
      deliveryId,
      repoFullName,
      appId,
      privateKey,
      insertPayload
    };

    switch (eventName) {
      case 'pull_request':
        await handlePullRequest(handlerContext);
        break;
      case 'pull_request_review':
      case 'pull_request_review_comment':
        await handlePullRequestReview(handlerContext);
        break;
      case 'issues':
      case 'issue_comment':
        await handleIssues(handlerContext);
        break;
      case 'push':
        await handlePush(handlerContext);
        break;
      case 'repository':
        await handleRepository(handlerContext);
        break;
      case 'check_run':
        await handleCheckRun(handlerContext);
        break;
      case 'security_advisory':
      case 'code_scanning_alert':
      case 'dependabot_alert':
      case 'secret_scanning_alert':
        await handleAlerts(handlerContext);
        break;
      case 'commit_comment':
      case 'create':
      case 'custom_property':
      case 'custom_property_values':
      case 'delete':
      case 'fork':
      case 'label':
      case 'milestone':
      case 'star':
      case 'workflow_run':
        await handleMiscellaneous(handlerContext);
        break;
      default:
        console.log(`Unhandled event type: ${eventName}`);
    }

    return c.json({ success: true, delivery_id: deliveryId });

  } catch (error: any) {
    console.error('Failed to process webhook', error);
    return c.json({ error: 'Processing error', details: error.message }, 500);
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

    const conditions: any[] = [];

    if (search) {
        conditions.push(or(
            like(webhookDeliveries.payload, `%${search}%`),
            like(webhookDeliveries.summary_payload, `%${search}%`)
        ));
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

    const totalResult = await db.select({ count: sql<number>`count(*)` }).from(webhookDeliveries).where(whereClause).get();
    const total = totalResult?.count || 0;

    let results: typeof webhookDeliveries.$inferSelect[] = [];
    if (total > 0) {
        results = await db.select()
            .from(webhookDeliveries)
            .where(whereClause)
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
