
import { Hono } from 'hono'
import { Bindings } from '@utils/hono'
import { getWebhooksDb } from '@db/webhooks'
import { webhookDeliveries } from '@db/schema-webhooks'
import { getDb } from '@db'
import { tasks, repos } from '@db/schema'
import { desc, like, and, eq, sql, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import type { GitHubWebhookPayload, GitHubIssuesPayload } from '@custom-types/github-webhooks'
import { ensureRepositoryFromWebhook } from '@services/repository-sync'

const app = new Hono<{ Bindings: Env }>()

// Webhook listener
app.post('/', async (c) => {
    const event = c.req.header('x-github-event');
    const signature = c.req.header('x-hub-signature-256');
    const deliveryId = c.req.header('x-github-delivery');
    const body = (await c.req.json()) as GitHubWebhookPayload & Record<string, any>;

    if (!event || !deliveryId) return c.text('Missing event or delivery ID', 400);

    if (body.repository) {
        c.executionCtx.waitUntil(
            ensureRepositoryFromWebhook(c.env, body.repository).catch((error) => {
                console.error('[api/webhooks] Failed to sync repository record:', error);
            })
        );
    }

    // 1. Log the webhook
    const webhooksDb = getWebhooksDb(c.env.DB_WEBHOOKS)
    await webhooksDb.insert(webhookDeliveries).values({
        id: crypto.randomUUID(),
        delivery_id: deliveryId,
        event,
        payload: JSON.stringify(body),
        signature_sha256: signature || '',
        created_at: new Date().toISOString()
    });

    // 2. Handle Sync Logic
    if (event === 'issues') {
        const issuesPayload = body as GitHubIssuesPayload & Record<string, any>;
        const action = String(issuesPayload.action || '');
        const issue = issuesPayload.issue;
        const repository = issuesPayload.repository;
        const db = getDb(c.env.DB);

        // Import Enums/Mapper locally or at top level (using top level imports added below)
        const { TaskStatus, KanbanColumn } = await import('@custom-types/enums');
        const { StatusMapper } = await import('@services/statusMapper');

        // Find internal repo ID
        const repoRecord = await db.select().from(repos).where(and(eq(repos.owner, repository.owner.login), eq(repos.name, repository.name))).limit(1);

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
                    kanbanColumn = StatusMapper.mapStatusToColumn(status); // Usually PLANNED if TODO
                }

                if (action === 'assigned' || action === 'unassigned') {
                    // Check assignee again 
                    if (assignee) kanbanColumn = KanbanColumn.PLANNED;
                    else kanbanColumn = KanbanColumn.BACKLOG;

                    // Sync status to column
                    const syncedStatus = StatusMapper.mapColumnToStatus(kanbanColumn);
                    status = syncedStatus;

                } else if (action === 'edited' && kanbanColumn !== KanbanColumn.DONE) {
                    // Treat edits as activity -> in_progress?
                    if (kanbanColumn !== KanbanColumn.BACKLOG) {
                        status = TaskStatus.IN_PROGRESS;
                        kanbanColumn = KanbanColumn.IN_PROGRESS;
                    }
                }
            }

            // Determine Timestamps
            let startAt: string | undefined;
            let endAt: string | undefined;

            if (status === TaskStatus.IN_PROGRESS || kanbanColumn === KanbanColumn.IN_PROGRESS) {
                // Potential start time
            }

            if (status === TaskStatus.DONE || kanbanColumn === KanbanColumn.DONE) {
                endAt = new Date().toISOString();
            }

            if (action === 'opened') {
                // New task
                if (status === TaskStatus.IN_PROGRESS || kanbanColumn === KanbanColumn.IN_PROGRESS) {
                    startAt = new Date().toISOString();
                }

                await db.insert(tasks).values({
                    id: crypto.randomUUID(),
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
                const existingTask = await db.select().from(tasks).where(and(eq(tasks.repoId, internalRepoId), eq(tasks.githubIssueId, issue.number))).limit(1);

                let updatePayload: any = {
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
    }

    return c.json({ success: true });
});

// Getter (existing)
const QuerySchema = z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('50'),
    event: z.string().optional(),
    repo: z.string().optional(),
    search: z.string().optional(),
})

app.get('/', zValidator('query', QuerySchema), async (c) => {
    const { page, limit, event, repo, search } = c.req.valid('query')
    const pageNumber = parseInt(page)
    const limitNumber = parseInt(limit)
    const offset = (pageNumber - 1) * limitNumber

    const db = getWebhooksDb(c.env.DB_WEBHOOKS)

    const conditions = []

    if (event && event !== 'all') {
        const events = event.split(',').map(e => e.trim());
        if (events.length > 1) {
            conditions.push(inArray(webhookDeliveries.event, events));
        } else {
            conditions.push(eq(webhookDeliveries.event, events[0]));
        }
    }

    if (repo) {
        // Basic search within the JSON payload for the repo name
        // This isn't perfect but works for simple filtering without a dedicated column
        conditions.push(like(webhookDeliveries.payload, `%${repo}%`))
    }

    if (search) {
        conditions.push(like(webhookDeliveries.payload, `%${search}%`))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Get total count
    const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(webhookDeliveries)
        .where(whereClause)

    // Get data
    const data = await db
        .select()
        .from(webhookDeliveries)
        .where(whereClause)
        .orderBy(desc(webhookDeliveries.created_at))
        .limit(limitNumber)
        .offset(offset)

    return c.json({
        data,
        meta: {
            total: count,
            page: pageNumber,
            limit: limitNumber,
            totalPages: Math.ceil(count / limitNumber),
        },
    })
})

export default app
