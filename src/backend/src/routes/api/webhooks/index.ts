/**
 * ============================================================================
 * CRITICAL: GITHUB WEBHOOK RECEIVER — DO NOT CHANGE THE ENDPOINT PATH
 * ============================================================================
 *
 * @file src/backend/src/routes/api/webhooks/index.ts
 * @module webhooks
 *
 * CANONICAL WEBHOOK URL:
 *   https://core-github-api.hacolby.workers.dev/api/webhooks
 *
 * This endpoint is registered in the GitHub App settings at:
 *   https://github.com/settings/apps/core-github-api → Webhook URL
 *
 * ⚠️  WARNING FOR FUTURE AGENTS ⚠️
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. The route is mounted in `src/backend/src/routes/index.ts` as:
 *      .route('/api/webhooks', webhooksApi)
 *    DO NOT rename this segment. The GitHub App is configured to POST to
 *    exactly `https://core-github-api.hacolby.workers.dev/api/webhooks`.
 *    Changing this path will immediately break ALL GitHub event delivery and
 *    will result in webhook failures showing in the GitHub App delivery log.
 *
 * 2. The internal POST handler in this file is `webhookHandler`, registered
 *    as `webhooksApi.post('/')`. The effective external path resolves to
 *    POST /api/webhooks. DO NOT move this handler to a different sub-path.
 *
 * 3. The webhook secret for signature verification is stored in Cloudflare
 *    Secrets as `GITHUB_WEBHOOK_SECRET`. Any mismatch between this secret
 *    and the secret configured in the GitHub App will produce HTTP 401 on
 *    every delivery.
 *
 * 4. Webhook deliveries are persisted to the `DB_WEBHOOKS` D1 database in
 *    the `webhook_deliveries` table. Do not redirect writes to `DB` (core).
 *
 * 5. Idempotency is enforced via `delivery_id` deduplication checks.
 *    Duplicate deliveries will be silently acknowledged (200 OK) without
 *    re-processing.
 *
 * 6. The health check for this endpoint is at:
 *      GET /api/health/github-app-webhooks  ← verifies URL config + deliveries
 *    See `src/backend/src/routes/api/ops/health.ts` for the implementation.
 *
 * HISTORY:
 *   - The GitHub App was originally configured to POST to `/webhooks` (wrong).
 *   - This was corrected to `/api/webhooks` (the actual worker path).
 *   - The env var `WEBHOOK_URL` in `wrangler.jsonc` is kept in sync with this.
 * ============================================================================
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, like, sql, and, inArray, gte, lte, or } from 'drizzle-orm';

// Internal schema & database imports
import { getGitHubPrivateKey, getGitHubAppId, getGitHubWebhookSecret } from "@utils/secrets";
import { generateUuid } from "@/utils/common";
import { getWebhooksDb, getDb } from '@db';
import { webhookDeliveries } from '@/db/schemas/github/webhooks';

// Types & Services
import type { GitHubWebhookPayload } from '@/types/github/webhooks';
import { App } from 'octokit';
import { Octokit } from '@octokit/rest';
import { getSandbox } from '@cloudflare/sandbox';
import { sanitizeRepoName } from '@/ai/mcp/tools/sandbox-sdk';
import { AutomationRegistry } from '@/automations/core/AutomationRegistry';
import { JulesService } from '@/services/jules/service';
import { getAgentByName } from 'agents';
import { Logger } from '@/lib/logger';

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
  const loggerPreface = '[Unified GitHub Webhook Handler]';

  const logger = new Logger(c.env, loggerPreface);

  if (!deliveryId || !eventName || !signature) {
    logger.error(`${loggerPreface} Missing required headers; deliveryId: ${deliveryId}, eventName: ${eventName}, signature: ${signature}`);
    return c.json({ error: 'Missing required headers' }, 400);
  }

  

  const privateKey = await getGitHubPrivateKey(c.env);
  const appId = await getGitHubAppId(c.env);
  const webhookSecret = await getGitHubWebhookSecret(c.env);

  if (!privateKey || !appId || !webhookSecret) {
    logger.error(`${loggerPreface} Missing GitHub App configuration`);
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
  } catch (error: any) {
    logger.error(`${loggerPreface} Webhook verification failed; error: ${error?.message || error}`);
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const payload = JSON.parse(rawBody) as GitHubWebhookPayload & {
    repository?: { full_name?: string; owner?: { login?: string }; name?: string };
    installation?: { id?: number; account?: { login?: string } };
    pull_request?: { number?: number };
    issue?: { number?: number };
    action?: string;
    check_run?: { status?: string; conclusion?: string; name?: string; details_url?: string; check_suite?: { head_branch?: string }; pull_requests?: Array<{ number: number }> };
  } & Record<string, unknown>;
  const action = payload.action || null;
  const repoFullName = payload.repository?.full_name;
  const installationId = payload.installation?.id || (installationTargetId ? parseInt(installationTargetId) : undefined);

  if (repoFullName && !repoFullName.startsWith("jmbish04/")) {
    logger.info(`${loggerPreface} CI Healer: Ignoring repo outside jmbish04/ scope: ${repoFullName}`);
    return c.json({ success: true, status: 'ignored_scope' });
  }

  // CI Healer: Automatically trigger Jules when a check_run fails on our repos
  if (
    eventName === "check_run" &&
    action === "completed" &&
    payload.check_run?.conclusion === "failure" &&
    repoFullName
  ) {
    logger.info(`${loggerPreface} CI Healer: Triggering Jules to fix failing check run: ${payload.check_run.name}`);
    const branch = payload.check_run?.check_suite?.head_branch;
    const owner = payload.repository?.owner?.login;
    const repoName = payload.repository?.name;

    if (branch && owner && repoName) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            
            // First, check if there's an active session for this branch
            const db = getDb(c.env.DB);
            // Dynamic import to avoid top-level D1 schema circular deps if any
            const { julesSessions } = await import('@db/schemas/jules');
            const { eq, and, inArray, desc } = await import('drizzle-orm');

            const activeSession = await db.select()
              .from(julesSessions)
              .where(and(
                eq(julesSessions.repoName, repoName),
                eq(julesSessions.repoOwner, owner),
                eq(julesSessions.branch, branch),
                inArray(julesSessions.status, ["active", "waiting_for_user", "stuck"])
              ))
              .orderBy(desc(julesSessions.updatedAt))
              .limit(1)
              .get();

            if (!activeSession) {
              logger.info(`${loggerPreface} CI Healer: No active session found for ${repoFullName} branch ${branch}. Skipping to prevent quota drain.`);
              return;
            }

            // Deduplication: To prevent blasting Jules if multiple checks fail exactly at the same time
            // Let's use KV or caches to debounce? Actually, just relying on sendMessage instead of startSession
            // will dramatically reduce quota usage (1 message vs 1 new repocloning session).
            
            const { analyzeBuildFailure } = await import('@/automations/pr/build-analyzer/analysis');
            
            const PR_NUM = payload.check_run?.pull_requests?.[0]?.number || 1;
            const analysisResult = await analyzeBuildFailure(c.env, {
                prNumber: PR_NUM, 
                prTitle: `Failed Check: ${payload.check_run?.name}`,
                headRef: branch,
                repoFullName
            });
            
            const fixInstructions = analysisResult.fixPrompt;
            let docsContext = "";
            const rawLogs = analysisResult.relevantLogs;

            if (fixInstructions.toLowerCase().includes("binding") || rawLogs.toLowerCase().includes("binding not found")) {
                docsContext = `\n\nCRITICAL CF FIX COMMAND: The logs indicate missing Cloudflare resource bindings. You MUST use 'cf_d1_create', 'cf_kv_create', or equivalent Cloudflare MCP tools to physically provision them. Update wrangler.jsonc with the binding name. Do NOT tell the user to do it. Just do it.\n\nRAW LOGS EXTRACT:\n${rawLogs}`;
            } else {
                docsContext = `\n\nRAW LOGS EXTRACT:\n${rawLogs}`;
            }

            const jules = JulesService.getInstance(c.env);
            const message = `The CI check "${payload.check_run?.name}" failed on branch '${branch}'.\n\n${fixInstructions}${docsContext}`;
            
            await jules.sendMessage(activeSession.id, message);
            logger.info(`${loggerPreface} CI Healer: Sent failure message to existing Jules session ${activeSession.id} for ${repoFullName} branch ${branch}`);
          } catch (e: any) {
            logger.error(`${loggerPreface} CI Healer: Failed to send CI failure to Jules session; error: ${e?.message || e}`);
          }
        })()
      );
    }
  }

  // PR Reviewer (Sandbox + AI Gateway)
  if (eventName === 'pull_request' && (action === 'opened' || action === 'reopened')) {
    logger.info(`${loggerPreface} PR-Reviewer: Triggering Sandbox review for PR #${payload.pull_request?.number}`);
    c.executionCtx.waitUntil(reviewPullRequest(payload, c.env));
    // Notice: we do NOT return early here because we still want to log the webhook delivery in D1.
  }

  // ── Colby Command: /colby merge conflicts or @colby merge conflicts ────────
  if (
    eventName === "issue_comment" &&
    action === "created" &&
    (payload as any).issue?.pull_request && // comment is on a PR
    /@?colby\s+merge\s+conflicts/i.test((payload as any).comment?.body ?? "")
  ) {
    const prBody = payload as any;
    const prOwner = prBody.repository?.owner?.login;
    const prRepo = prBody.repository?.name;
    const prNumber = prBody.issue?.number;
    const headBranch = (prBody.issue as any)?.head?.ref ?? "unknown"; // enriched below
    const baseBranch = prBody.repository?.default_branch ?? "main";

    if (prOwner && prRepo && prNumber) {
      logger.info(`${loggerPreface} Colby command: merge conflicts on ${prOwner}/${prRepo}#${prNumber}`);

      c.executionCtx.waitUntil(
        (async () => {
          try {
            const octokit = new Octokit({ auth: c.env.GITHUB_PERSONAL_ACCESS_TOKEN });

            // Enrich with actual head branch from PR data
            const { data: pr } = await octokit.pulls.get({ owner: prOwner, repo: prRepo, pull_number: prNumber });

            // Post acknowledgement comment immediately
            await octokit.issues.createComment({
              owner: prOwner, repo: prRepo, issue_number: prNumber,
              body: `🤖 **Colby** is resolving merge conflicts on this PR (branch \`${pr.head.ref}\`).\n\n_This may take 1–2 minutes. I'll post an update when done._`,
            });

            // Dispatch to EngineerAgent via RPC
            const { getAgentByName: getAgent } = await import("agents");
            const engineer = await getAgent(c.env.ENGINEER_AGENT as any, "singleton");
            const result = await (engineer as any).resolveConflicts({
              owner: prOwner,
              repo: prRepo,
              prNumber,
              headBranch: pr.head.ref,
              baseBranch: pr.base.ref,
            });

            // Post result comment
            const statusEmoji = result.success ? "✅" : "❌";
            const summary = result.success
              ? `Resolved **${result.resolvedFiles.length}** file(s): ${result.resolvedFiles.join(", ")}${result.commitSha ? `\n\nCommit: \`${result.commitSha}\`` : ""}`
              : `Failed to resolve conflicts: ${result.error ?? "Unknown error"}`;

            await octokit.issues.createComment({
              owner: prOwner, repo: prRepo, issue_number: prNumber,
              body: `${statusEmoji} **Colby conflict resolution complete.**\n\n${summary}`,
            });
          } catch (err: any) {
            logger.error(`${loggerPreface} Colby merge conflicts failed: ${err?.message || err}`);
          }
        })()
      );
    }
  }

  // Agent Dispatching (Kept isolated as per earlier design)
  if (repoFullName && c.env.GITHUB_AGENT) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const agent = await getAgentByName(c.env.GITHUB_AGENT as any, sanitizeRepoName(repoFullName));
          // Direct DO RPC — no HTTP round-trip needed for same-Worker calls
          await (agent as any).handleWebhookEvent(eventName, JSON.parse(rawBody));
        } catch (error: any) {
          logger.error(`${loggerPreface} RepoAgent: Failed to dispatch webhook; error: ${error?.message || error}`);
        }
      })()
    );
  }

  if (c.env.GITHUB_AGENT) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const ownerKey =
            payload.repository?.owner?.login ||
            (payload as { installation?: { account?: { login?: string } } }).installation?.account?.login ||
            (c.env as { GITHUB_OWNER?: string }).GITHUB_OWNER ||
            'default-owner';
          const agent = await getAgentByName(c.env.GITHUB_AGENT as any, sanitizeRepoName(ownerKey));
          // Direct DO RPC — no HTTP round-trip needed for same-Worker calls
          await (agent as any).handleWebhookEvent(eventName, JSON.parse(rawBody));
        } catch (error: any) {
          logger.error(`${loggerPreface} OwnerAgent: Failed to dispatch webhook; error: ${error?.message || error}`);
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
    logger.info(`${loggerPreface} Webhook: Duplicate delivery ${deliveryId}, skipping.`);
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
          logger.error(`${loggerPreface} Webhook: ${failures} automations failed for delivery ${deliveryId}`);
        }
      })
    );
    return c.json({ success: true, delivery_id: deliveryId });

  } catch (error: unknown) {
    logger.error(`${loggerPreface} Webhook: Failed to process webhook; error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return c.json({ error: 'Processing error', details: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
}

// ==========================================
// POST / : GitHub Webhook Sync Listener
// ==========================================
// ============================================================================
// ⚠️  CANONICAL GITHUB WEBHOOK RECEIVER — DO NOT CHANGE THIS PATH ⚠️
// External URL: POST https://core-github-api.hacolby.workers.dev/api/webhooks
// This path is hardcoded in the GitHub App settings. See module docstring above.
// ============================================================================
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
    const db = getWebhooksDb(c.env.DB_WEBHOOKS);
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
    const db = getWebhooksDb(c.env.DB_WEBHOOKS);
    const [total, recent] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(webhookDeliveries).get(),
        db.select({ count: sql<number>`count(*)` }).from(webhookDeliveries).where(sql`created_at > datetime('now', '-24 hours')`).get()
    ]);
    const topEvents = await db.select({ event: webhookDeliveries.event, count: sql<number>`count(*)` })
    .from(webhookDeliveries).groupBy(webhookDeliveries.event).orderBy(desc(sql`count(*)`)).limit(10).all();

    return c.json({ total: total?.count || 0, recent24h: recent?.count || 0, topEvents });
});

// ==========================================
// GET /:owner/:repo/pr/:pull_number/initial : Initial PR Webhook Payload
// ==========================================
webhooksApi.get('/:owner/:repo/pr/:pull_number/initial', async (c) => {
    const db = getWebhooksDb(c.env.DB_WEBHOOKS);
    const owner = c.req.param('owner');
    const repo = c.req.param('repo');
    const pull_number = c.req.param('pull_number');
    
    const repoFullName = `${owner}/${repo}`;
    
    const prNumber = parseInt(pull_number, 10);
    const results = await db.select()
        .from(webhookDeliveries)
        .where(
            and(
                like(webhookDeliveries.repo_full_name, repoFullName),
                eq(webhookDeliveries.event, 'pull_request'),
                sql`json_extract(${webhookDeliveries.payload}, '$.pull_request.number') = ${prNumber}`
            )
        )
        .orderBy(desc(webhookDeliveries.created_at))
        .limit(1)
        .all();

    const match = results[0];

    if (!match) {
        return c.json({ success: false, error: 'Webhook payload not found for this PR' }, 404);
    }

    return c.json({ success: true, data: { payload: match.payload } });
});

async function reviewPullRequest(payload: any, env: any): Promise<void> {
  const pr = payload.pull_request;
  const repo = payload.repository;
  const loggerPreface = '[Unified GitHub Webhook Handler]';
  const logger = new Logger(env, loggerPreface);

  logger.info(`${loggerPreface} PR-Reviewer: Starting repoless session for PR #${pr.number} in ${repo.full_name}`);

  const octokit = new Octokit({ auth: env.GITHUB_PERSONAL_ACCESS_TOKEN });
  const sandbox = getSandbox(env.SANDBOX, `review-${pr.number}`);

  try {
    await octokit.issues.createComment({
      owner: repo.owner.login,
      repo: repo.name,
      issue_number: pr.number,
      body: "Code review in progress...",
    });
    logger.info(`${loggerPreface} PR-Reviewer: Posted initial comment for PR #${pr.number}`);

    const cloneUrl = `https://${env.GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/${repo.owner.login}/${repo.name}.git`;
    logger.info(`${loggerPreface} PR-Reviewer: Cloning repository ${repo.full_name}...`);
    await sandbox.exec(`git clone --depth=1 --branch=${pr.head.ref} ${cloneUrl} /workspace/repo`);

    const comparison = await octokit.repos.compareCommits({
      owner: repo.owner.login,
      repo: repo.name,
      base: pr.base.sha,
      head: pr.head.sha,
    });

    const files = [];
    logger.info(`${loggerPreface} PR-Reviewer: Extracting file diffs and contents...`);
    for (const file of (comparison.data.files || []).slice(0, 5)) {
      if (file.status !== "removed") {
        try {
          const content = await sandbox.readFile(`/workspace/repo/${file.filename}`);
          files.push({
            path: file.filename,
            patch: file.patch || "",
            content: content.content,
          });
        } catch (readError: any) {
          logger.warn(`${loggerPreface} PR-Reviewer: Failed to read file ${file.filename}; error: ${readError.message || readError}`);
        }
      }
    }

    const changedFilesText = files.map((f: any) => "File: " + f.path + "\nDiff:\n" + f.patch + "\n\nContent:\n" + f.content).join("\n\n");

    const jules = JulesService.getInstance(env);
    logger.info(`${loggerPreface} PR-Reviewer: Dispatching to Jules Repoless Session for Gemini 3.1 Pro analysis...`);
    const { agentMessage } = await jules.runRepolessSession(
      `Review this PR:\nTitle: ${pr.title}\nChanged files:\n${changedFilesText}\nProvide a brief code review focusing on bugs, security, and best practices.`
    );

    const review = agentMessage || "No review generated";
    logger.info(`${loggerPreface} PR-Reviewer: Review generated successfully. Posting final comment.`);

    await octokit.issues.createComment({
      owner: repo.owner.login,
      repo: repo.name,
      issue_number: pr.number,
      body: `## Code Review\n\n${review}\n\n---\n*Generated by Jules Repoless Session*`,
    });
  } catch (error: any) {
    logger.error(`${loggerPreface} PR-Reviewer: Failed to review PR #${pr.number}; error: ${error.message || error}`);
    await octokit.issues.createComment({
      owner: repo.owner.login,
      repo: repo.name,
      issue_number: pr.number,
      body: `Review failed: ${error.message}`,
    });
  } finally {
    logger.info(`${loggerPreface} PR-Reviewer: Destroying sandbox environment review-${pr.number}`);
    await sandbox.destroy();
  }
}

export default webhooksApi;
