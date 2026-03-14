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
            timestamp: new Date().toISOString()
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
    repoId: string,
    githubIssueId: number | null | undefined,
    actionFn: (owner: string, repoName: string, issueNumber: number | undefined) => Promise<T>,
    logOptions?: {
        requestId: string;
        taskId: string | null;
        eventType: string;
        details?: any;
        githubIssueId?: number | null | ((res: T) => number | null);
    }
) {
    // null safely aborts operations for unlinked entities; undefined bypasses the guard
    if (githubIssueId === null) return null as T | null;

    const repoRecord = await getRepoById(db, repoId);
    if (!repoRecord) return null as T | null;

    const { owner, name } = repoRecord;

    let result: T | null = null;
    let actionError: string | null = null;
    let isSuccess = false;

    try {
        result = await actionFn(owner, name, githubIssueId || undefined);
        isSuccess = !!result;
    } catch (e: any) {
        actionError = e.message;
    }

    if (logOptions) {
        const details = actionError ? { error: actionError, ...logOptions.details } : logOptions.details;

        // Resolve the issue ID either from the generic resolution callback, static prop, or original input
        const resolvedIssueId = typeof logOptions.githubIssueId === 'function'
            ? (result ? logOptions.githubIssueId(result) : null)
            : (logOptions.githubIssueId !== undefined ? logOptions.githubIssueId : (githubIssueId || null));

        await logTaskEvent(
            db,
            logOptions.requestId,
            logOptions.taskId,
            resolvedIssueId,
            logOptions.eventType,
            isSuccess ? 'success' : 'failed',
            details
        );
    }

    return result;
}

function getTaskById(db: ReturnType<typeof getDb>, id: string) {
    return db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then(res => res[0] || null);
}

function getRepoByOwnerAndName(db: ReturnType<typeof getDb>, owner: string, repo: string) {
    return db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, repo))).limit(1).then(res => res[0] || null);
}

function getRepoById(db: ReturnType<typeof getDb>, id: string) {
    return db.select().from(repos).where(eq(repos.id, id)).limit(1).then(res => res[0] || null);
}

function getBaseContext(c: Context<{ Bindings: Bindings }>) {
    return {
        db: getDb(c.env.DB),
        requestId: generateUuid(),
        now: new Date().toISOString()
    };
}

async function getRepoContext(c: Context<{ Bindings: Bindings }>) {
    const { owner, repo } = c.req.param();
    const baseCtx = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(baseCtx.db, owner, repo);
    if (!repoRecord) {
        return { error: 'Repo not found', status: 404, ...baseCtx, owner, repo, repoRecord: null as any };
    }
    return { ...baseCtx, owner, repo, repoRecord: repoRecord! };
}

async function getTaskContext(c: Context<{ Bindings: Bindings }>) {
    const { id } = c.req.param();
    const baseCtx = getBaseContext(c);
    const task = await getTaskById(baseCtx.db, id);
    if (!task) {
        return { error: 'Task not found', status: 404, ...baseCtx, id, task: null as any };
    }
    return { ...baseCtx, id, task: task! };
}

function calculateTaskTimestamps(
    status: TaskStatus,
    column: KanbanColumn,
    now: string,
    currentStartAt: string | null = null,
    currentEndAt: string | null = null
) {
    const isInProgress = status === TaskStatus.IN_PROGRESS || column === KanbanColumn.IN_PROGRESS;
    const isDone = status === TaskStatus.DONE || column === KanbanColumn.DONE;

    const timestamps: { startAt?: string | null; endAt?: string | null } = {};

    if (isInProgress && !currentStartAt) {
        timestamps.startAt = now;
    }

    if (isDone) {
        timestamps.endAt = now;
    } else if (currentEndAt) {
        timestamps.endAt = null;
    }

    return timestamps;
}

const tasksApi = new Hono<{ Bindings: Bindings }>();

// GET /api/repos/:owner/:repo/tasks
tasksApi.get('/repos/:owner/:repo/tasks', async (c) => {
    const ctx = await getRepoContext(c);

    if ('error' in ctx) {
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
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
    const { db } = getBaseContext(c);
    
    // Concurrently fetch global and workshop tasks
    const [rows, workshopRows] = await Promise.all([
        db.select().from(tasks).where(eq(tasks.isDeleted, 0)).limit(100).orderBy(tasks.updatedAt),
        db.select().from(tasks).where(eq(tasks.taskType, 'workshop_project')).limit(100)
    ]);

    const mappedWorkshop = workshopRows.flatMap(w => {
        const phases = (w.taskContext as any)?.phases || [];
        return phases.flatMap((p: any) => {
            const phaseTasks = p.tasks || [];
            return phaseTasks.map((t: any) => {
                const mappedStatus = t.status === 'not_started' ? TaskStatus.TODO :
                                     t.status === 'in_progress' ? TaskStatus.IN_PROGRESS : TaskStatus.DONE;

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
    const ctx = await getRepoContext(c);
    const body = await c.req.json();
    const { title, description, status, assignee } = body as any;

    // Log API Request using ctx.db and ctx.requestId
    await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'pending', { owner: ctx.owner, repo: ctx.repo, body });

    if ('error' in ctx) {
        await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'failed', { error: ctx.error });
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }

    const { owner, repo, db, requestId, now, repoRecord } = ctx;

    // 1. Create GitHub Issue
    const issue = await performGithubAction(
        db,
        repoRecord.id,
        undefined, // bypasses null check to allow creation
        (repoOwner, repoName) => createGitHubIssue(c.env, repoOwner, repoName, title, description, assignee ? [assignee] : undefined),
        {
            requestId,
            taskId: null,
            eventType: 'github_issue_create',
            githubIssueId: (res: any) => res?.number || null,
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
    const timestamps = calculateTaskTimestamps(initialStatus, initialColumn, now);

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
            startAt: timestamps.startAt || null,
            endAt: timestamps.endAt || null
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
    const ctx = await getTaskContext(c);
    if ('error' in ctx) {
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }

    const { id, task, db, requestId, now } = ctx;
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;

    await logTaskEvent(db, requestId, id, task.githubIssueId, 'api_request_update_task', 'pending', body);

    const syncField = <K extends string, G>(obj: any, key: K, val: G | undefined, transform?: (v: G) => any) => {
        if (val !== undefined) obj[key] = transform ? transform(val) : val;
    };

    // Determines updates for GitHub
    // Sync to GitHub if linked
    if (task.githubIssueId) {
        const updates: any = {};
        const targetStatus = (status as TaskStatus) || task.status as TaskStatus;

        updates.state = targetStatus === TaskStatus.DONE ? 'closed' : 'open';
        syncField(updates, 'title', title);
        syncField(updates, 'body', description);
        syncField(updates, 'assignees', assignee, (a) => a ? [a] : []);

        if (Object.keys(updates).length > 0) {
            await performGithubAction(
                db,
                task.repoId,
                task.githubIssueId,
                (owner, name, issueNumber) => updateGitHubIssue(c.env, owner, name, issueNumber!, updates),
                { requestId, taskId: id, eventType: 'github_issue_update', details: updates }
            );
        }
    }

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
    // 2. If Status Changed, does Column need to sync? (Priority driven by what was passed)
    // If BOTH passed, Mapper shouldn't override explicit values unless strictly invalid? 
    // Let's assume explicit input wins, but if only one passed, we sync the other.
    else if (status && status !== currentStatus) {
        const syncedColumn = StatusMapper.getSyncColumn(nextColumn, nextStatus);
        if (syncedColumn) nextColumn = syncedColumn;
    }

    // Prepare DB Update Payload
    const updatePayload: any = {
        updatedAt: now,
        ...calculateTaskTimestamps(nextStatus, nextColumn, now, task.startAt, task.endAt)
    };

    if (nextStatus !== currentStatus) updatePayload.status = nextStatus;
    if (nextColumn !== currentColumn) updatePayload.kanbanColumn = nextColumn;

    syncField(updatePayload, 'position', position);
    syncField(updatePayload, 'title', title);
    syncField(updatePayload, 'description', description);
    syncField(updatePayload, 'assignee', assignee);

    // Update Local
    await db.update(tasks)
        .set(updatePayload)
        .where(eq(tasks.id, id));

    await logTaskEvent(db, requestId, id, task.githubIssueId, 'db_task_update', 'success');

    return c.json({ success: true });
});

// POST /api/tasks/:id/comments
tasksApi.post('/tasks/:id/comments', async (c) => {
    const ctx = await getTaskContext(c);
    if ('error' in ctx) {
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }

    const { id, task, db, requestId, now } = ctx;
    const { content, author } = await c.req.json() as any;

    // Sync to GitHub
    const comment = await performGithubAction(
        db,
        task.repoId,
        task.githubIssueId,
        (owner, name, issueNumber) => createGitHubComment(c.env, owner, name, issueNumber!, `**${author || 'User'}**: ${content}`),
        { requestId, taskId: id, eventType: 'github_comment_create' }
    );

    // Save Local
    const commentId = generateUuid();
    await db.insert(taskComments).values({
        id: commentId,
        taskId: id,
        content,
        author: author || 'system',
        githubCommentId: comment?.id || null,
        createdAt: now,
        updatedAt: now
    });

    return c.json({ success: true, id: commentId });
});

// DELETE /api/tasks/:id (Soft delete)
tasksApi.delete('/tasks/:id', async (c) => {
    const ctx = await getTaskContext(c);
    if ('error' in ctx) {
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }

    const { id, task, db, requestId, now } = ctx;

    if (task.githubIssueId) {
        await performGithubAction(
            db,
            task.repoId,
            task.githubIssueId,
            (owner, name, issueNumber) => updateGitHubIssue(c.env, owner, name, issueNumber!, { state: 'closed' }),
            { requestId, taskId: id, eventType: 'github_issue_close' }
        );
    }

    await db.update(tasks)
        .set({
            isDeleted: 1,
            updatedAt: now
        })
        .where(eq(tasks.id, id));

    await logTaskEvent(db, requestId, id, task.githubIssueId || null, 'db_task_soft_delete', 'success');

    return c.json({ success: true });
});

export default tasksApi;
