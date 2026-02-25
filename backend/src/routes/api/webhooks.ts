import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, like, sql, and, inArray, gte, lte, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

// Internal schema & database imports
import { getDb } from '@db';
import { tasks, repos } from '@db/schema';
import { webhookDeliveries } from '@/db/schemas/github/webhooks';
import { generateUuid } from "@/utils/common";
import { summarizeWebhookPayload } from "@/utils/webhook-summary";

// Types & Services
import type { GitHubWebhookPayload, GitHubIssuesPayload } from '@/types/github/webhooks';
import { ensureRepositoryFromWebhook } from '@services/repository-sync';

const webhooksApi = new Hono<{ Bindings: Env }>();

// ==========================================
// POST / : GitHub Webhook Sync Listener
// ==========================================
webhooksApi.post('/', async (c) => {
    const event = c.req.header('x-github-event');
    const signature = c.req.header('x-hub-signature-256');
    const deliveryId = c.req.header('x-github-delivery');
    const body = (await c.req.json()) as GitHubWebhookPayload & Record<string, any>;

    if (!event || !deliveryId) return c.text('Missing event or delivery ID', 400);

    // Sync Repository in background
    if (body.repository) {
        c.executionCtx.waitUntil(
            ensureRepositoryFromWebhook(c.env, body.repository).catch((error) => {
                console.error('[api/webhooks] Failed to sync repository record:', error);
            })
        );
    }


    // 1. Log the webhook delivery securely to the Webhooks D1 DB
    try {
        const webhooksDb = drizzle(c.env.DB_WEBHOOKS);
        const repoFullName = body.repository?.full_name || null;
        await webhooksDb.insert(webhookDeliveries).values({
            id: generateUuid(),
            delivery_id: deliveryId,
            event,
            action: body.action || null,
            repo_full_name: repoFullName,
            payload: JSON.stringify(body),
            summary_payload: summarizeWebhookPayload(body),
            signature_sha256: signature || '',
            created_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('[api/webhooks] Failed to log webhook delivery:', error);
    }

    // Trigger Stats Update on Push
    if (event === 'push' && body.repository) {
        c.executionCtx.waitUntil(
            import('@services/stats-updater').then(m => 
                m.updateRepoStats(c.env, body.repository.owner.login, body.repository.name)
            )
        );
    }

    // Process PR Ingestion
    if (event === 'pull_request') {
        c.executionCtx.waitUntil(
            import('@services/github/pr-ingestion').then(m => m.processPullRequestEvent(c.env, body).catch(e => console.error('[api/webhooks] PR ingest error:', e)))
        );
    } else if (event === 'pull_request_review_comment') {
        c.executionCtx.waitUntil(
            import('@services/github/pr-ingestion').then(m => m.processCodeReviewComment(c.env, body).catch(e => console.error('[api/webhooks] PR review ingest error:', e)))
        );
    }

    // 2. Handle Task/Kanban Sync Logic
    if (event === 'issues') {
        const issuesPayload = body as GitHubIssuesPayload & Record<string, any>;
        const action = String(issuesPayload.action || '');
        const issue = issuesPayload.issue;
        const repository = issuesPayload.repository;
        const db = getDb(c.env.DB); // Primary Database

        // Import Enums/Mapper locally to avoid top-level circular dependencies if any
        const { TaskStatus, KanbanColumn } = await import('@/types/project-management/enums');
        const { StatusMapper } = await import('@services/statusMapper');

        // Find internal repo ID
        const repoRecord = await db.select()
            .from(repos)
            .where(and(eq(repos.owner, repository.owner.login), eq(repos.name, repository.name)))
            .limit(1);

        if (repoRecord.length) {
            const internalRepoId = repoRecord[0].id;

            // Determine Assignee
            let assignee = issue.assignee ? issue.assignee.login : null;
            if (issue.body && issue.body.includes('/colby')) {
                assignee = 'system';
            }

            // Determine Status & Kanban Column
            let status = TaskStatus.BACKLOG;
            let kanbanColumn = KanbanColumn.BACKLOG;

            if (issue.state === 'closed') {
                status = TaskStatus.DONE;
                kanbanColumn = KanbanColumn.DONE;
            } else {
                // Open state
                if (assignee) {
                    status = TaskStatus.TODO;
                    kanbanColumn = StatusMapper.mapStatusToColumn(status);
                }

                if (action === 'assigned' || action === 'unassigned') {
                    if (assignee) kanbanColumn = KanbanColumn.PLANNED;
                    else kanbanColumn = KanbanColumn.BACKLOG;

                    // Sync status to column
                    const syncedStatus = StatusMapper.mapColumnToStatus(kanbanColumn);
                    status = syncedStatus;

                } else if (action === 'edited' && kanbanColumn !== KanbanColumn.DONE) {
                    // Treat edits as activity
                    if (kanbanColumn !== KanbanColumn.BACKLOG) {
                        status = TaskStatus.IN_PROGRESS;
                        kanbanColumn = KanbanColumn.IN_PROGRESS;
                    }
                }
            }

            // Determine Timestamps
            let startAt: string | undefined;
            let endAt: string | undefined;

            if (status === TaskStatus.DONE || kanbanColumn === KanbanColumn.DONE) {
                endAt = new Date().toISOString();
            }

            if (action === 'opened') {
                // New task
                if (status === TaskStatus.IN_PROGRESS || kanbanColumn === KanbanColumn.IN_PROGRESS) {
                    startAt = new Date().toISOString();
                }

                await db.insert(tasks).values({
                    id: generateUuid(),
                    repoId: internalRepoId,
                    title: issue.title,
                    description: issue.body,
                    status: status,
                    kanbanColumn: kanbanColumn,
                    assignee: assignee,
                    githubIssueId: issue.number,
                    githubHtmlUrl: issue.html_url,
                    createdAt: issue.created_at,
                    updatedAt: issue.updated_at,
                    startAt: startAt,
                    endAt: endAt
                });
            } else if (action === 'edited' || action === 'closed' || action === 'reopened') {
                // Update existing task
                const existingTask = await db.select()
                    .from(tasks)
                    .where(and(eq(tasks.repoId, internalRepoId), eq(tasks.githubIssueId, issue.number)))
                    .limit(1);

                const updatePayload: any = {
                    title: issue.title,
                    description: issue.body,
                    status: status,
                    kanbanColumn: kanbanColumn,
                    assignee: assignee,
                    updatedAt: new Date().toISOString(),
                    endAt: endAt
                };

                if (status !== TaskStatus.DONE && kanbanColumn !== KanbanColumn.DONE) {
                    updatePayload.endAt = null; // Reset endAt if reopened/moved back
                } else {
                    updatePayload.endAt = new Date().toISOString();
                }

                if ((status === TaskStatus.IN_PROGRESS || kanbanColumn === KanbanColumn.IN_PROGRESS) && existingTask.length > 0 && !existingTask[0].startAt) {
                    updatePayload.startAt = new Date().toISOString();
                }

                await db.update(tasks)
                    .set(updatePayload)
                    .where(and(eq(tasks.repoId, internalRepoId), eq(tasks.githubIssueId, issue.number)));
            }
        }
    } else if (event === 'issue_comment') {
        const payload = body as any;
        const action = payload.action;
        const comment = payload.comment;
        const issue = payload.issue;
        const repository = payload.repository;
        const db = getDb(c.env.DB);

        // Process standard PR Comment Ingestion
        if (issue?.pull_request) {
            c.executionCtx.waitUntil(
                import('@services/github/pr-ingestion').then(m => m.processStandardPrComment(c.env, body).catch(e => console.error('[api/webhooks] PR comment ingest error:', e)))
            );
        }

        // Only process created comments
        if (action === 'created') {
            const body = comment.body.trim();
            
            // Check for slash commands
            if (body.startsWith('/colby')) {
                const octokit = await import('../../services/octokit/core').then(m => m.getOctokit(c.env));
                
                // Add eyes emoji to acknowledge receipt
                await octokit.reactions.createForIssueComment({
                    owner: repository.owner.login,
                    repo: repository.name,
                    comment_id: comment.id,
                    content: 'eyes'
                });

                // Parse command
                const isSuccess = true; // Placeholder for actual execution result

                if (isSuccess) {
                     await octokit.reactions.createForIssueComment({
                        owner: repository.owner.login,
                        repo: repository.name,
                        comment_id: comment.id,
                        content: 'hooray' // 🎉
                    });
                } else {
                     await octokit.reactions.createForIssueComment({
                        owner: repository.owner.login,
                        repo: repository.name,
                        comment_id: comment.id,
                        content: '-1' // 👎
                    });
                }
            }
        }
    }

    return c.json({ success: true });
});

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

    const conditions = [];

    // Keyword search on payload + summary_payload
    if (search) {
        conditions.push(
            or(
                like(webhookDeliveries.payload, `%${search}%`),
                like(webhookDeliveries.summary_payload, `%${search}%`)
            )
        );
    }

    // Event type filter (supports comma-separated)
    if (type && type !== 'all') {
        const events = type.split(',').map(e => e.trim());
        if (events.length > 1) {
            conditions.push(inArray(webhookDeliveries.event, events));
        } else {
            conditions.push(eq(webhookDeliveries.event, events[0]));
        }
    }

    // Action filter
    if (action && action !== 'all') {
        conditions.push(eq(webhookDeliveries.action, action));
    }

    // Repo filter (supports partial match)
    if (repo) {
        conditions.push(like(webhookDeliveries.repo_full_name, `%${repo}%`));
    }

    // Date range filters
    if (from) {
        conditions.push(gte(webhookDeliveries.created_at, from));
    }
    if (to) {
        conditions.push(lte(webhookDeliveries.created_at, to));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 1. Get Total Count
    const totalResult = await db.select({ count: sql<number>`count(*)` })
        .from(webhookDeliveries)
        .where(whereClause)
        .get();
    
    const total = totalResult?.count || 0;

    // 2. Get Results (if total > 0)
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

    // 3. Get distinct repos for filter dropdown
    const distinctRepos = await db.selectDistinct({ repo_full_name: webhookDeliveries.repo_full_name })
        .from(webhookDeliveries)
        .where(sql`${webhookDeliveries.repo_full_name} IS NOT NULL`)
        .orderBy(webhookDeliveries.repo_full_name)
        .limit(50)
        .all();

    // 4. Get distinct actions for filter dropdown
    const distinctActions = await db.selectDistinct({ action: webhookDeliveries.action })
        .from(webhookDeliveries)
        .where(sql`${webhookDeliveries.action} IS NOT NULL`)
        .orderBy(webhookDeliveries.action)
        .limit(50)
        .all();

    return c.json({
        data: results,
        filters: {
            repos: distinctRepos.map(r => r.repo_full_name).filter(Boolean),
            actions: distinctActions.map(a => a.action).filter(Boolean),
        },
        pagination: {
            page: pageNum,
            limit: limitNum,
            total: total,
            totalPages: Math.ceil(total / limitNum) || 1
        }
    });
});

// ==========================================
// GET /stats : Webhook Delivery Analytics
// ==========================================
webhooksApi.get('/stats', async (c) => {
    const db = drizzle(c.env.DB_WEBHOOKS);

    const [total, recent] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(webhookDeliveries).get(),
        db.select({ count: sql<number>`count(*)` })
            .from(webhookDeliveries)
            .where(sql`created_at > datetime('now', '-24 hours')`)
            .get()
    ]);

    const topEvents = await db.select({
        event: webhookDeliveries.event,
        count: sql<number>`count(*)`
    })
    .from(webhookDeliveries)
    .groupBy(webhookDeliveries.event)
    .orderBy(desc(sql`count(*)`))
    .limit(10)
    .all();

    return c.json({
        total: total?.count || 0,
        recent24h: recent?.count || 0,
        topEvents
    });
});

export default webhooksApi;