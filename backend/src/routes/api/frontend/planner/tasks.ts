// src/routes/api/tasks.ts
import { Hono } from 'hono';
import type { Context } from 'hono';
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
/**
 * Execute a generic GitHub Action with centralized logging.
 */
async function executeGithubAction<T>(
    db: ReturnType<typeof getDb>,
    actionFn: () => Promise<T | null>,
    logOptions: {
        requestId: string;
        taskId: string | null;
        githubIssueId?: number | null;
        eventType: string;
        details?: any;
    },
    extractLogData?: (result: T) => { githubIssueId?: number | null, details?: any }
): Promise<T | null> {
    let result: T | null = null;
    let actionError = null;

    try {
        result = await actionFn();
    } catch (e: any) {
        actionError = e.message;
    }

    const isSuccess = !!result;

    let finalIssueId = logOptions.githubIssueId ?? null;
    let finalDetails = logOptions.details;

    if (isSuccess && extractLogData) {
        const extracted = extractLogData(result as T);
        if (extracted.githubIssueId !== undefined) finalIssueId = extracted.githubIssueId;
        if (extracted.details !== undefined) {
             finalDetails = finalDetails ? { ...finalDetails, ...extracted.details } : extracted.details;
        }
    }

    if (actionError) {
        finalDetails = finalDetails ? { error: actionError, ...finalDetails } : { error: actionError };
    }

    await logTaskEvent(
        db,
        logOptions.requestId,
        logOptions.taskId,
        finalIssueId,
        logOptions.eventType,
        isSuccess ? 'success' : 'failed',
        finalDetails
    );

    return result;
}

/**
 * Execute a GitHub Action if the task is linked to a repository.
 */
async function performGithubAction<T>(
    db: ReturnType<typeof getDb>,
    repoId: string,
    githubIssueId: number | null,
    actionFn: (owner: string, repoName: string, issueNumber: number) => Promise<T | null>,
    logOptions: {
        requestId: string;
        taskId: string | null;
        eventType: string;
        details?: any;
    }
): Promise<T | null> {
    if (!githubIssueId) return null;

    const repoRecord = await getRepoById(db, repoId);
    if (!repoRecord) return null;

    return executeGithubAction(
        db,
        () => actionFn(repoRecord.owner, repoRecord.name, githubIssueId),
        {
            requestId: logOptions.requestId,
            taskId: logOptions.taskId,
            githubIssueId,
            eventType: logOptions.eventType,
            details: logOptions.details
        }
    );
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

function getBaseContext(c: Context<{ Bindings: Env }>) {
    return {
        db: getDb(c.env.DB),
        requestId: generateUuid(),
        now: new Date().toISOString()
    };
}

async function getTaskContext(c: Context<{ Bindings: Env }>) {
    const { id } = c.req.param();
    const ctx = getBaseContext(c);
    const task = await getTaskById(ctx.db, id);
    if (!task) return { error: 'Task not found', status: 404 as const, task: null as any, id, ...ctx };
    return { id, task: task!, ...ctx };
}

async function getRepoContext(c: Context<{ Bindings: Env }>) {
    const { owner, repo } = c.req.param();
    const ctx = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(ctx.db, owner, repo);
    if (!repoRecord) return { error: 'Repo not found', status: 404 as const, repoRecord: null as any, owner, repo, ...ctx };
    return { owner, repo, repoRecord: repoRecord!, ...ctx };
}

function calculateTaskTimestamps(task: any, nextStatus: TaskStatus, nextColumn: KanbanColumn, now: string) {
    let startAt = task.startAt;
    let endAt = task.endAt;

    const isStarted = nextStatus === TaskStatus.IN_PROGRESS || nextColumn === KanbanColumn.IN_PROGRESS;
    const isCompleted = nextStatus === TaskStatus.DONE || nextColumn === KanbanColumn.DONE;

    if (isStarted && !startAt) {
        startAt = now;
    }

    if (isCompleted) {
        endAt = now;
    } else if (endAt) {
        endAt = null;
    }

    return { startAt, endAt };
}

const tasksApi = new Hono<{ Bindings: Env }>();

// GET /api/repos/:owner/:repo/tasks
tasksApi.get('/repos/:owner/:repo/tasks', async (c) => {
    const ctx = await getRepoContext(c);
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);
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
    // Join with repos to get context if needed, or just return flat
    const rows = await db.select().from(tasks).where(eq(tasks.isDeleted, 0)).limit(100).orderBy(tasks.updatedAt);
    
    // Also fetch workshop tasks for global view
    const workshopRows = await db.select().from(tasks).where(eq(tasks.taskType, 'workshop_project')).limit(100);
    const mappedWorkshop = workshopRows.flatMap(w => {
        const context = (w.taskContext || {}) as any;
        const phases = Array.isArray(context.phases) ? context.phases : [];

        return phases.flatMap((p: any) => {
            const phaseTasks = Array.isArray(p.tasks) ? p.tasks : [];
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
    const body = await c.req.json();
    const { title, description, status, assignee } = body as any;

    // Get context but don't early return yet to ensure we log the API request
    const ctx = await getRepoContext(c);
    const { db, requestId, now } = ctx;
    const owner = c.req.param('owner');
    const repo = c.req.param('repo');

    // Log API Request
    await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'pending', { owner, repo, body });

    if ('error' in ctx) {
        await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'failed', { error: 'Repo not found' });
        return c.json({ success: false, error: ctx.error }, ctx.status);
    }
    const { repoRecord } = ctx;

    // 1. Create GitHub Issue
    const issue = await executeGithubAction(
        db,
        () => createGitHubIssue(c.env, owner, repo, title, description, assignee ? [assignee] : undefined),
        { requestId, taskId: null, eventType: 'github_issue_create' },
        (result) => ({ githubIssueId: result.number, details: { html_url: result.html_url } })
    );

    if (!issue) {
        return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500);
    }

    // 2. Create Local Task
    const newId = generateUuid();

    // Logic: Status defaults to TODO (per schema), Mapper determines column
    const initialStatus = (status as TaskStatus) || TaskStatus.TODO;
    const initialColumn = StatusMapper.mapStatusToColumn(initialStatus);

    const { startAt, endAt } = calculateTaskTimestamps({}, initialStatus, initialColumn, now);

    let dbError = null;
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
    } catch (e: any) {
        dbError = e.message;
    }

    await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', dbError ? 'failed' : 'success', dbError ? { error: dbError } : undefined);

    if (dbError) {
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    const ctx = await getTaskContext(c);
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);
    const { id, db, requestId, now, task } = ctx;

    await logTaskEvent(db, requestId, id, task.githubIssueId, 'api_request_update_task', 'pending', body);

    // Determine final Status and KanbanColumn using Mapper
    const currentStatus = task.status as TaskStatus;
    const currentColumn = task.kanbanColumn as KanbanColumn;

    let nextStatus = status ? (status as TaskStatus) : currentStatus;
    let nextColumn = kanbanColumn ? (kanbanColumn as KanbanColumn) : currentColumn;

    if (kanbanColumn && kanbanColumn !== currentColumn) {
        const syncedStatus = StatusMapper.getSyncStatus(nextStatus, nextColumn);
        if (syncedStatus) nextStatus = syncedStatus;
    } else if (status && status !== currentStatus) {
        const syncedColumn = StatusMapper.getSyncColumn(nextColumn, nextStatus);
        if (syncedColumn) nextColumn = syncedColumn;
    }

    // Prepare GitHub and Local Update Payloads jointly
    const githubUpdates: any = {};
    const updatePayload: Partial<typeof task> = { updatedAt: now };

    const syncField = <K extends keyof typeof task, G extends string>(
        value: any,
        currentValue: any,
        localKey: K,
        githubKey?: G,
        transformGh?: (v: any) => any
    ) => {
        if (value !== undefined && value !== currentValue) {
            (updatePayload as any)[localKey] = value;
            if (githubKey) {
                const ghVal = transformGh ? transformGh(value) : value;
                if (ghVal !== undefined) githubUpdates[githubKey] = ghVal;
            }
        }
    };

    syncField(nextStatus, currentStatus, 'status', 'state', (v) => v === TaskStatus.DONE ? 'closed' : 'open');
    syncField(nextColumn, currentColumn, 'kanbanColumn');
    syncField(title, task.title, 'title', 'title', (v) => v || undefined);
    syncField(description, task.description, 'description', 'body', (v) => v || undefined);
    syncField(assignee, task.assignee, 'assignee', 'assignees', (v) => v ? [v] : []);
    syncField(position, task.position, 'position');

    const { startAt, endAt } = calculateTaskTimestamps(task, nextStatus, nextColumn, now);
    if (startAt !== task.startAt) updatePayload.startAt = startAt;
    if (endAt !== task.endAt) updatePayload.endAt = endAt;

    // Sync to GitHub if linked
    if (task.githubIssueId && Object.keys(githubUpdates).length > 0) {
        await performGithubAction(
            db,
            task.repoId,
            task.githubIssueId,
            (owner, name, issueNumber) => updateGitHubIssue(c.env, owner, name, issueNumber, githubUpdates),
            { requestId, taskId: id, eventType: 'github_issue_update', details: githubUpdates }
        );
    }

    // Update Local
    await db.update(tasks)
        .set(updatePayload)
        .where(eq(tasks.id, id));

    await logTaskEvent(db, requestId, id, task.githubIssueId, 'db_task_update', 'success');

    return c.json({ success: true });
});

// POST /api/tasks/:id/comments
tasksApi.post('/tasks/:id/comments', async (c) => {
    const { content, author } = await c.req.json() as any;
    const ctx = await getTaskContext(c);
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);
    const { id, db, requestId, now, task } = ctx;

    // Sync to GitHub
    const comment = await performGithubAction(
        db,
        task.repoId,
        task.githubIssueId,
        (owner, name, issueNumber) => createGitHubComment(c.env, owner, name, issueNumber, `**${author || 'User'}**: ${content}`),
        { requestId, taskId: id, eventType: 'github_comment_create' }
    );
    const githubCommentId = comment ? comment.id : null;

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
    const ctx = await getTaskContext(c);
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);
    const { id, db, requestId, now, task } = ctx;

    if (task.githubIssueId) {
        await performGithubAction(
            db,
            task.repoId,
            task.githubIssueId,
            (owner, name, issueNumber) => updateGitHubIssue(c.env, owner, name, issueNumber, { state: 'closed' }),
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
