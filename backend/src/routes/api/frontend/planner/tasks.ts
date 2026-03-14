// src/routes/api/tasks.ts
import { Hono, Context } from 'hono';
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
    db: any,
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
async function performGithubAction<T>(
    db: ReturnType<typeof getDb>,
    id: number | null | undefined,
    actionFn: () => Promise<T>,
    logOptions?: {
        requestId: string;
        taskId?: string | null;
        githubIssueId?: number | null | ((res: T) => number | null);
        eventType: string;
        details?: any | ((res: T) => any);
    }
) {
    if (id === null) return null;

    try {
        const result = await actionFn();
        if (logOptions) {
            const resolvedIssueId = typeof logOptions.githubIssueId === 'function' ? (result ? logOptions.githubIssueId(result) : null) : logOptions.githubIssueId;
            const resolvedDetails = typeof logOptions.details === 'function' ? (result ? logOptions.details(result) : null) : logOptions.details;
            await logTaskEvent(db, logOptions.requestId, logOptions.taskId || null, resolvedIssueId || null, logOptions.eventType, result ? 'success' : 'failed', resolvedDetails);
        }
        return result;
    } catch (e: any) {
        if (logOptions) {
            const resolvedIssueId = typeof logOptions.githubIssueId === 'function' ? null : logOptions.githubIssueId;
            let errorDetails: any = { error: e.message };
            if (typeof logOptions.details !== 'function' && logOptions.details) {
                if (typeof logOptions.details === 'object') {
                    errorDetails = { ...errorDetails, ...logOptions.details };
                } else {
                    errorDetails.details = logOptions.details;
                }
            }
            await logTaskEvent(db, logOptions.requestId, logOptions.taskId || null, resolvedIssueId || null, logOptions.eventType, 'failed', errorDetails);
        }
        return null;
    }
}

async function getRepoByOwnerAndName(db: any, owner: string, name: string) {
    return await db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1).then((res: any[]) => res[0] || null);
}

async function getTaskById(db: any, id: string) {
    return await db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then((res: any[]) => res[0] || null);
}

function getBaseContext(c: Context<{ Bindings: Env }>) {
    return {
        db: getDb(c.env.DB),
        requestId: generateUuid(),
        now: new Date().toISOString()
    };
}

function calculateTaskTimestamps(status: TaskStatus, column: KanbanColumn, now: string, currentStartAt?: string | null, currentEndAt?: string | null) {
    let startAt = currentStartAt;
    let endAt = currentEndAt;

    if ((status === TaskStatus.IN_PROGRESS || column === KanbanColumn.IN_PROGRESS) && !startAt) {
        startAt = now;
    }

    if (status === TaskStatus.DONE || column === KanbanColumn.DONE) {
        endAt = now;
    } else if ((status as TaskStatus) !== TaskStatus.DONE && (column as KanbanColumn) !== KanbanColumn.DONE && endAt) {
        endAt = null; // Reset if moving out of done
    }

    return { startAt, endAt };
}

async function getTaskContext(c: Context<{ Bindings: Env }>, id: string) {
    const { db, requestId, now } = getBaseContext(c);
    const task = await getTaskById(db, id);
    if (!task) return { error: 'Task not found', status: 404 as const, db, requestId, now };
    const repoRecord = await db.select().from(repos).where(eq(repos.id, task.repoId)).limit(1).then((res: any[]) => res[0] || null);
    if (!repoRecord) return { error: 'Repo not found', status: 404 as const, db, requestId, now };
    return { db, requestId, now, task, repoRecord };
}

async function getRepoContext(c: Context<{ Bindings: Env }>, owner: string, repo: string) {
    const { db, requestId, now } = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(db, owner, repo);
    if (!repoRecord) return { error: 'Repo not found', status: 404 as const, db, requestId, now };
    return { db, requestId, now, repoRecord };
}

async function updateLocalTask(db: any, task: any, payload: any, requestId: string, eventType: string) {
    await db.update(tasks)
        .set(payload)
        .where(eq(tasks.id, task.id));
    await logTaskEvent(db, requestId, task.id, task.githubIssueId, eventType, 'success');
}

const tasksApi = new Hono<{ Bindings: Env }>();

// GET /api/repos/:owner/:repo/tasks
tasksApi.get('/repos/:owner/:repo/tasks', async (c) => {
    const { owner, repo } = c.req.param();
    const ctx = await getRepoContext(c, owner, repo);

    if ('error' in ctx) {
        return c.json({ success: false, error: ctx.error }, ctx.status);
    }

    const { db, repoRecord } = ctx;

    const rows = await db.select().from(tasks).where(and(eq(tasks.repoId, repoRecord.id), eq(tasks.isDeleted, 0)));
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
    const db = getDb(c.env.DB);
    // Join with repos to get context if needed, or just return flat
    const rows = await db.select().from(tasks).where(eq(tasks.isDeleted, 0)).limit(100).orderBy(tasks.updatedAt);
    
    // Also fetch workshop tasks for global view
    const workshopRows = await db.select().from(tasks).where(eq(tasks.taskType, 'workshop_project')).limit(100);
    const mappedWorkshop = workshopRows.flatMap(w => {
        const context = (w.taskContext || {}) as any;

        return (Array.isArray(context.phases) ? context.phases : []).flatMap((p: any) => {
            return (Array.isArray(p.tasks) ? p.tasks : []).map((t: any) => {
                const mappedStatus = t.status === 'not_started' ? TaskStatus.TODO
                    : (t.status === 'in_progress' ? TaskStatus.IN_PROGRESS : TaskStatus.DONE);

                return {
                    id: `${w.id}-${p.phase_number}-${t.task_number}`,
                    repoId: w.repoId,
                    title: `[Phase ${p.phase_number}] ${t.task_title}`,
                    description: t.task_description || '',
                    status: mappedStatus,
                    kanbanColumn: StatusMapper.mapStatusToColumn(mappedStatus),
                    assignee: t.agent_assigned || null,
                    githubIssueId: null,
                    githubHtmlUrl: null,
                    createdAt: w.createdAt,
                    updatedAt: w.updatedAt,
                    startAt: null,
                    endAt: null,
                    isDeleted: 0
                };
            });
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
    const { owner, repo } = c.req.param();
    const body = await c.req.json();
    const { title, description, status, assignee } = body as any;

    const ctx = await getRepoContext(c, owner, repo);
    const { db, requestId, now } = ctx;

    // Log API Request
    await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'pending', { owner, repo, body });

    if ('error' in ctx) {
        await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'failed', { error: ctx.error });
        return c.json({ success: false, error: ctx.error }, ctx.status);
    }

    const { repoRecord } = ctx;

    // 1. Create GitHub Issue (bypassing ID guard by passing undefined)
    const issue = await performGithubAction(
        db,
        undefined,
        async () => await createGitHubIssue(c.env, owner, repo, title, description, assignee ? [assignee] : undefined),
        {
            requestId,
            eventType: 'github_issue_create',
            githubIssueId: (res: any) => res?.number || null,
            details: (res: any) => res ? { html_url: res.html_url } : undefined
        }
    );

    if (!issue) {
        return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500);
    }

    // 2. Create Local Task
    const newId = generateUuid();

    // Logic: Status defaults to TODO (per schema), Mapper determines column
    const initialStatus = (status as TaskStatus) || TaskStatus.TODO;
    const initialColumn = StatusMapper.mapStatusToColumn(initialStatus);

    const { startAt, endAt } = calculateTaskTimestamps(initialStatus, initialColumn, now);

    try {
        await db.insert(tasks).values({
            id: newId,
            repoId: repoRecord.id,
            title,
            description,
            status: initialStatus,
            kanbanColumn: initialColumn,
            assignee,
            githubIssueId: issue.number,
            githubHtmlUrl: issue.html_url,
            createdAt: now,
            updatedAt: now,
            startAt,
            endAt
        });
        await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', 'success');
        return c.json({ success: true, id: newId });
    } catch (e: any) {
        await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', 'failed', { error: e.message });
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    
    const ctx = await getTaskContext(c, id);

    if ('error' in ctx) {
        return c.json({ success: false, error: ctx.error }, ctx.status);
    }

    const { db, requestId, now, task, repoRecord } = ctx;

    await logTaskEvent(db, requestId, id, task.githubIssueId, 'api_request_update_task', 'pending', body);

    // Determine final Status and KanbanColumn using Mapper
    const currentStatus = task.status as TaskStatus;
    const currentColumn = task.kanbanColumn as KanbanColumn;

    let nextStatus = status ? (status as TaskStatus) : currentStatus;
    let nextColumn = kanbanColumn ? (kanbanColumn as KanbanColumn) : currentColumn;

    // 1. If Column Changed, does Status need to sync?
    if (kanbanColumn && kanbanColumn !== currentColumn) {
        const syncedStatus = StatusMapper.getSyncStatus(nextStatus, nextColumn);
        if (syncedStatus) nextStatus = syncedStatus;
    }
    // 2. If Status Changed, does Column need to sync?
    else if (status && status !== currentStatus) {
        const syncedColumn = StatusMapper.getSyncColumn(nextColumn, nextStatus);
        if (syncedColumn) nextColumn = syncedColumn;
    }

    // Update Timestamps
    const { startAt, endAt } = calculateTaskTimestamps(nextStatus, nextColumn, now, task.startAt, task.endAt);

    // Prepare DB Update Payload and GitHub Updates
    const updatePayload: any = { updatedAt: now };
    const ghUpdates: any = {};

    if (nextStatus !== currentStatus) {
        updatePayload.status = nextStatus;
        ghUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
    }
    if (nextColumn !== currentColumn) updatePayload.kanbanColumn = nextColumn;
    if (startAt !== task.startAt) updatePayload.startAt = startAt;
    if (endAt !== task.endAt) updatePayload.endAt = endAt;
    if (position !== undefined) updatePayload.position = position;

    // Merge duplicate payload construction
    const syncField = <K extends string, G extends string>(field: K, val: any, ghField: G, ghTransform?: (v: any) => any) => {
        if (val !== undefined && val !== task[field]) {
            updatePayload[field] = val;
            ghUpdates[ghField] = ghTransform ? ghTransform(val) : val;
        }
    };

    syncField('title', title, 'title');
    syncField('description', description, 'body');
    syncField('assignee', assignee, 'assignees', (v: any) => v ? [v] : []);

    // Sync to GitHub if linked
    if (task.githubIssueId && Object.keys(ghUpdates).length > 0) {
        // Ensure state is explicitly set during synchronization to preserve legacy behavior
        ghUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';

        await performGithubAction(
            db,
            task.githubIssueId,
            async () => await updateGitHubIssue(c.env, repoRecord!.owner, repoRecord!.name, task.githubIssueId!, ghUpdates),
            { requestId, taskId: task.id, githubIssueId: task.githubIssueId, eventType: 'github_issue_update', details: ghUpdates }
        );
    }

    // Update Local
    await updateLocalTask(db, task, updatePayload, requestId, 'db_task_update');

    return c.json({ success: true });
});

// POST /api/tasks/:id/comments
tasksApi.post('/tasks/:id/comments', async (c) => {
    const { id } = c.req.param();
    const { content, author } = await c.req.json() as any;

    const ctx = await getTaskContext(c, id);
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);

    const { db, requestId, now, task, repoRecord } = ctx;

    // Sync to GitHub
    const comment = await performGithubAction(
        db,
        task.githubIssueId,
        async () => await createGitHubComment(c.env, repoRecord!.owner, repoRecord!.name, task.githubIssueId!, `**${author || 'User'}**: ${content}`),
        { requestId, taskId: task.id, githubIssueId: task.githubIssueId, eventType: 'github_comment_create' }
    );
    const githubCommentId = comment?.id || null;

    // Save Local
    const commentId = generateUuid();
    await db.insert(taskComments).values({
        id: commentId,
        taskId: id,
        content,
        author: author || 'system',
        githubCommentId,
        createdAt: now,
        updatedAt: now
    });

    return c.json({ success: true, id: commentId });
});

// DELETE /api/tasks/:id (Soft delete)
tasksApi.delete('/tasks/:id', async (c) => {
    const { id } = c.req.param();

    const ctx = await getTaskContext(c, id);
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);

    const { db, requestId, now, task, repoRecord } = ctx;

    await performGithubAction(
        db,
        task.githubIssueId,
        async () => await updateGitHubIssue(c.env, repoRecord!.owner, repoRecord!.name, task.githubIssueId!, { state: 'closed' }),
        { requestId, taskId: task.id, githubIssueId: task.githubIssueId, eventType: 'github_issue_close' }
    );

    await updateLocalTask(
        db,
        task,
        { isDeleted: 1, updatedAt: now },
        requestId,
        'db_task_soft_delete'
    );

    return c.json({ success: true });
});

export default tasksApi;
