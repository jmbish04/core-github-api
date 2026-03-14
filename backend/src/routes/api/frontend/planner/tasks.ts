// src/routes/api/tasks.ts
import { Hono, Context } from 'hono';
import { Bindings } from '@utils/hono';
import { getDb } from '@db';
import { tasks, taskEvents, taskComments } from '@db/schemas/projects/tasks';
import { repos } from '@db/schemas/github/repos';
import { eq, and } from 'drizzle-orm';
import { createGitHubIssue, updateGitHubIssue, createGitHubComment } from '@/ai/mcp/tools/github/github';

import { TaskStatus, KanbanColumn } from '@/types/project-management/enums';
import { StatusMapper } from '@services/statusMapper';
import { generateUuid } from "@/utils/common";

// Define standardized task statuses/columns
export const TASK_STATUSES = [
    { id: TaskStatus.TODO, name: "To Do", color: "#6B7280" },
    { id: TaskStatus.IN_PROGRESS, name: "In Progress", color: "#F59E0B" },
    { id: TaskStatus.DONE, name: "Done", color: "#10B981" },
];

/**
 * Log a Task Audit Event
 */
async function logTaskEvent(
    db: ReturnType<typeof getDb>,
    requestId: string,
    taskId: string | null,
    githubIssueId: number | null,
    eventType: string,
    status: 'pending' | 'success' | 'failed',
    details?: any,
    objectType?: string,
    fieldName?: string,
    oldValue?: string,
    newValue?: string
) {
    try {
        const now = new Date().toISOString();
        await db.insert(taskEvents).values({
            id: generateUuid(),
            requestId,
            taskId,
            githubIssueId,
            eventType,
            status,
            details: details ? JSON.stringify(details) : null,
            objectType,
            fieldName,
            oldValue,
            newValue,
            timestamp: now
        });
    } catch (e) {
        console.error("Failed to log task event", e);
    }
}

/**
 * Execute a GitHub Action if the task is linked to a repository.
 */
async function executeGithubAction<T>(
    db: ReturnType<typeof getDb>,
    repoId: string,
    actionFn: (owner: string, repoName: string) => Promise<T>,
    logOptions?: {
        requestId: string;
        taskId: string | null;
        issueNumber: number | ((res: T) => number) | null;
        eventType: string;
        details?: any;
    }
): Promise<T | null> {
    const repoRecord = await getRepoById(db, repoId);
    if (!repoRecord) return null;

    const { owner, name } = repoRecord;

    let result: T | null = null;
    let status: 'success' | 'failed' = 'failed';
    let details = logOptions?.details;

    try {
        result = await actionFn(owner, name);
        status = result ? 'success' : 'failed';
    } catch (e: any) {
        details = { error: e.message, ...details };
    }

    if (logOptions) {
        let issueId: number | null = null;
        if (typeof logOptions.issueNumber === 'function' && result) {
            issueId = logOptions.issueNumber(result);
        } else if (typeof logOptions.issueNumber === 'number') {
            issueId = logOptions.issueNumber;
        }

        await logTaskEvent(
            db,
            logOptions.requestId,
            logOptions.taskId,
            issueId,
            logOptions.eventType,
            status,
            details
        );
    }

    return result;
}

function processUpdate<K extends keyof any, G extends keyof any>(
    target: Partial<Record<K, any>>,
    ghTarget: Partial<Record<G, any>>,
    updates: Array<{ key: K, val: any, curr: any, ghKey?: G, ghVal?: any }>
) {
    for (const { key, val, curr, ghKey, ghVal } of updates) {
        if (val !== undefined && val !== curr) {
            target[key] = val;
            if (ghKey) {
                ghTarget[ghKey] = ghVal !== undefined ? ghVal : val;
            }
        }
    }
}

async function getRepoByOwnerAndName(db: ReturnType<typeof getDb>, owner: string, name: string) {
    return await db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1).then(res => res[0] || null);
}

async function getRepoById(db: ReturnType<typeof getDb>, id: string) {
    return await db.select().from(repos).where(eq(repos.id, id)).limit(1).then(res => res[0] || null);
}

async function getTaskById(db: ReturnType<typeof getDb>, id: string) {
    return await db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then(res => res[0] || null);
}


export function calculateTaskTimestamps(
    status: TaskStatus,
    column: KanbanColumn,
    currentStartAt: string | null,
    currentEndAt: string | null,
    now: string
): { startAt?: string | null; endAt?: string | null } {
    const isActive = status === TaskStatus.IN_PROGRESS || column === KanbanColumn.IN_PROGRESS;
    const isDone = status === TaskStatus.DONE || column === KanbanColumn.DONE;

    const result: { startAt?: string | null; endAt?: string | null } = {};

    if (isActive && !currentStartAt) {
        result.startAt = now;
    }

    if (isDone) {
        result.endAt = now;
    } else if (currentEndAt) {
        result.endAt = null;
    }

    return result;
}

function getRequestContext(c: Context<{ Bindings: Env }>) {
    return {
        db: getDb(c.env.DB),
        requestId: generateUuid(),
        now: new Date().toISOString()
    };
}

async function getRepoContext(c: Context<{ Bindings: Env }>) {
    const { owner, repo } = c.req.param();
    const ctx = getRequestContext(c);

    const repoRecord = await getRepoByOwnerAndName(ctx.db, owner, repo);
    if (!repoRecord) {
        return { error: 'Repo not found', status: 404, ...ctx, owner, repo, repoRecord: null };
    }

    return { error: null, owner, repo, repoRecord, ...ctx };
}

async function getTaskContext(c: Context<{ Bindings: Env }>) {
    const { id } = c.req.param();
    const ctx = getRequestContext(c);

    const task = await getTaskById(ctx.db, id);
    if (!task) {
        return { error: 'Task not found', status: 404, ...ctx, task: null, id };
    }

    return { error: null, task, id, ...ctx };
}

const tasksApi = new Hono<{ Bindings: Env }>();

// GET /api/repos/:owner/:repo/tasks
tasksApi.get('/repos/:owner/:repo/tasks', async (c) => {
    const ctx = await getRepoContext(c);
    if (ctx.error) return c.json({ success: false, error: ctx.error }, ctx.status as any);

    const rows = await ctx.db.select().from(tasks).where(and(eq(tasks.repoId, ctx.repoRecord!.id), eq(tasks.isDeleted, 0)));
    return c.json({
        success: true,
        tasks: rows,
        meta: {
            columns: TASK_STATUSES
        }
    });
});

// GET /api/tasks (Global list)
tasksApi.get('/', async (c) => {
    const { db } = getRequestContext(c);
    // Join with repos to get context if needed, or just return flat
    const rows = await db.select().from(tasks).where(eq(tasks.isDeleted, 0)).limit(100).orderBy(tasks.updatedAt);
    
    // Also fetch workshop tasks for global view
    const workshopRows = await db.select().from(tasks).where(eq(tasks.taskType, 'workshop_project')).limit(100);
    const mappedWorkshop = workshopRows.flatMap(w => {
        const context = (w.taskContext || {}) as any;
        if (!context.phases || !Array.isArray(context.phases)) return [];
        return context.phases.flatMap((p: any) => {
            if (!p.tasks || !Array.isArray(p.tasks)) return [];
            return p.tasks.map((t: any) => ({
                id: `${w.id}-${p.phase_number}-${t.task_number}`,
                repoId: w.repoId,
                title: `[Phase ${p.phase_number}] ${t.task_title}`,
                description: t.task_description || '',
                status: t.status === 'not_started' ? TaskStatus.TODO :
                        t.status === 'in_progress' ? TaskStatus.IN_PROGRESS : TaskStatus.DONE,
                kanbanColumn: t.status === 'not_started' ? KanbanColumn.PLANNED :
                              t.status === 'in_progress' ? KanbanColumn.IN_PROGRESS : KanbanColumn.DONE,
                assignee: t.agent_assigned || null,
                githubIssueId: null,
                githubHtmlUrl: null,
                createdAt: w.createdAt,
                updatedAt: w.updatedAt,
                startAt: null,
                endAt: null,
                isDeleted: 0
            }));
        });
    });

    // Combine and sort
    const combined = [...rows, ...mappedWorkshop]
        .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 100);

    return c.json({
        success: true,
        tasks: combined,
        meta: {
            columns: TASK_STATUSES
        }
    });
});

// POST /api/repos/:owner/:repo/tasks (Create Task & Issue)
tasksApi.post('/repos/:owner/:repo/tasks', async (c) => {
    const ctx = await getRepoContext(c);
    const body = await c.req.json();
    const { title, description, status, assignee } = body as any;

    // Log API Request
    await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'pending', { owner: ctx.owner, repo: ctx.repo, body });

    if (ctx.error) {
        await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'failed', { error: ctx.error });
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }

    // 1. Create GitHub Issue
    const issue = await createGitHubIssue(c.env, ctx.owner!, ctx.repo!, title, description, assignee ? [assignee] : undefined);

    await logTaskEvent(
        ctx.db, ctx.requestId, null, issue?.number || null, 'github_issue_create',
        issue ? 'success' : 'failed',
        issue ? { html_url: issue.html_url } : undefined
    );

    if (!issue) {
        return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500);
    }

    // 2. Create Local Task
    const newId = generateUuid();

    // Logic: Status defaults to TODO (per schema), Mapper determines column
    const initialStatus = (status as TaskStatus) || TaskStatus.TODO;
    const initialColumn = StatusMapper.mapStatusToColumn(initialStatus);

    const { startAt } = calculateTaskTimestamps(initialStatus, initialColumn, null, null, ctx.now);

    let dbError: any = null;
    try {
        await ctx.db.insert(tasks).values({
            id: newId,
            repoId: ctx.repoRecord!.id,
            title,
            description,
            status: initialStatus,
            kanbanColumn: initialColumn,
            assignee,
            githubIssueId: issue.number,
            githubHtmlUrl: issue.html_url,
            createdAt: ctx.now,
            updatedAt: ctx.now,
            startAt: startAt
        });
    } catch (e: any) {
        dbError = e;
    }

    await logTaskEvent(
        ctx.db, ctx.requestId, newId, issue.number, 'db_task_create',
        dbError ? 'failed' : 'success',
        dbError ? { error: dbError.message } : undefined
    );

    if (dbError) {
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const ctx = await getTaskContext(c);
    if (ctx.error) return c.json({ success: false, error: ctx.error }, ctx.status as any);

    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    const task = ctx.task!;

    await logTaskEvent(ctx.db, ctx.requestId, ctx.id, task.githubIssueId, 'api_request_update_task', 'pending', body);

    // Determine final Status and KanbanColumn using Mapper
    const currentStatus = task.status as TaskStatus;
    const currentColumn = task.kanbanColumn as KanbanColumn;

    let nextStatus = status !== undefined ? (status as TaskStatus) : currentStatus;
    let nextColumn = kanbanColumn !== undefined ? (kanbanColumn as KanbanColumn) : currentColumn;

    // 1. If Column Changed, does Status need to sync?
    if (kanbanColumn !== undefined && kanbanColumn !== currentColumn) {
        const syncedStatus = StatusMapper.getSyncStatus(nextStatus, nextColumn);
        if (syncedStatus) nextStatus = syncedStatus;
    }
    // 2. If Status Changed, does Column need to sync?
    else if (status !== undefined && status !== currentStatus) {
        const syncedColumn = StatusMapper.getSyncColumn(nextColumn, nextStatus);
        if (syncedColumn) nextColumn = syncedColumn;
    }

    // Consolidate DB Update and GitHub Sync Payloads
    const updatePayload: typeof tasks.$inferInsert = { id: task.id, repoId: task.repoId, title: task.title, updatedAt: ctx.now };
    const ghUpdates: Parameters<typeof updateGitHubIssue>[4] = {};

    if (nextStatus !== currentStatus) {
        updatePayload.status = nextStatus;
        ghUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
    }
    if (nextColumn !== currentColumn) {
        updatePayload.kanbanColumn = nextColumn;
    }

    processUpdate<keyof typeof updatePayload, keyof typeof ghUpdates>(updatePayload, ghUpdates, [
        { key: 'title', val: title, curr: task.title, ghKey: 'title' },
        { key: 'description', val: description, curr: task.description, ghKey: 'body' },
        { key: 'assignee', val: assignee, curr: task.assignee, ghKey: 'assignees', ghVal: assignee ? [assignee] : [] },
        { key: 'position', val: position, curr: task.position }
    ]);

    // Timestamps
    const timestamps = calculateTaskTimestamps(nextStatus, nextColumn, task.startAt, task.endAt, ctx.now);
    if (timestamps.startAt !== undefined) updatePayload.startAt = timestamps.startAt;
    if (timestamps.endAt !== undefined) updatePayload.endAt = timestamps.endAt;

    // Sync to GitHub if linked
    if (task.githubIssueId && Object.keys(ghUpdates).length > 0) {
        await executeGithubAction(
            ctx.db,
            task.repoId,
            (owner, name) => updateGitHubIssue(c.env, owner, name, task.githubIssueId!, ghUpdates),
            { requestId: ctx.requestId, taskId: ctx.id, issueNumber: task.githubIssueId, eventType: 'github_issue_update', details: ghUpdates }
        );
    }

    // Update Local
    await ctx.db.update(tasks)
        .set(updatePayload)
        .where(eq(tasks.id, ctx.id));

    await logTaskEvent(ctx.db, ctx.requestId, ctx.id, task.githubIssueId, 'db_task_update', 'success');

    return c.json({ success: true });
});

// POST /api/tasks/:id/comments
tasksApi.post('/tasks/:id/comments', async (c) => {
    const ctx = await getTaskContext(c);
    if (ctx.error) return c.json({ success: false, error: ctx.error }, ctx.status as any);

    const { content, author } = await c.req.json() as any;
    const task = ctx.task!;

    // Sync to GitHub
    let githubCommentId: number | null = null;
    if (task.githubIssueId) {
        await executeGithubAction(
            ctx.db,
            task.repoId,
            async (owner, name) => {
                const comment = await createGitHubComment(c.env, owner, name, task.githubIssueId!, `**${author || 'User'}**: ${content}`);
                if (comment) githubCommentId = comment.id;
                return comment;
            },
            { requestId: ctx.requestId, taskId: ctx.id, issueNumber: task.githubIssueId, eventType: 'github_comment_create' }
        );
    }

    // Save Local
    const commentId = generateUuid();
    await ctx.db.insert(taskComments).values({
        id: commentId,
        taskId: ctx.id,
        content,
        author: author || 'system',
        githubCommentId,
        createdAt: ctx.now,
        updatedAt: ctx.now
    });

    return c.json({ success: true, id: commentId });
});

// DELETE /api/tasks/:id (Soft delete)
tasksApi.delete('/tasks/:id', async (c) => {
    const ctx = await getTaskContext(c);
    if (ctx.error) return c.json({ success: false, error: ctx.error }, ctx.status as any);

    const task = ctx.task!;

    if (task.githubIssueId) {
        await executeGithubAction(
            ctx.db,
            task.repoId,
            (owner, name) => updateGitHubIssue(c.env, owner, name, task.githubIssueId!, { state: 'closed' }),
            { requestId: ctx.requestId, taskId: ctx.id, issueNumber: task.githubIssueId, eventType: 'github_issue_close' }
        );
    }

    await ctx.db.update(tasks)
        .set({
            isDeleted: 1,
            updatedAt: ctx.now
        })
        .where(eq(tasks.id, ctx.id));

    await logTaskEvent(ctx.db, ctx.requestId, ctx.id, task.githubIssueId, 'db_task_soft_delete', 'success');

    return c.json({ success: true });
});

export default tasksApi;
