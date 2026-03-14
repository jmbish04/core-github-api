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
    db: any,
    repoId: string,
    actionFn: (owner: string, repoName: string) => Promise<T>,
    logOptions?: {
        requestId: string;
        taskId: string | null;
        eventType: string;
        githubIssueId?: number | ((res: T) => number);
        details?: any | ((res: T) => any);
    }
): Promise<T | null> {
    const repoRecord = await db.select().from(repos).where(eq(repos.id, repoId)).limit(1);
    if (!repoRecord.length) return null;

    const { owner, name } = repoRecord[0];

    let result: T | null = null;
    let error: any = null;
    try {
        result = await actionFn(owner, name);
    } catch (e: any) {
        error = e;
    } finally {
        if (logOptions) {
            const status = result && !error ? 'success' : 'failed';
            const detailsRaw = typeof logOptions.details === 'function' ? (result ? logOptions.details(result) : undefined) : logOptions.details;
            const details = error ? { error: error.message, ...detailsRaw } : detailsRaw;
            const issueId = typeof logOptions.githubIssueId === 'function' ? (result ? logOptions.githubIssueId(result) : null) : (logOptions.githubIssueId as number | undefined) || null;
            await logTaskEvent(db, logOptions.requestId, logOptions.taskId, issueId, logOptions.eventType, status, details);
        }
    }
    return result;
}

async function getRepoByOwnerAndName(db: ReturnType<typeof getDb>, owner: string, repo: string) {
    return db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, repo))).limit(1).then(res => res[0] || null);
}

async function getTaskById(db: ReturnType<typeof getDb>, id: string) {
    return db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then(res => res[0] || null);
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
    const context = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(context.db, owner, repo);

    if (!repoRecord) {
        return { ...context, owner, repo, error: 'Repo not found', status: 404 as const };
    }

    return { owner, repo, ...context, repoRecord };
}

async function getTaskContext(c: Context<{ Bindings: Bindings }>) {
    const { id } = c.req.param();
    const context = getBaseContext(c);
    const task = await getTaskById(context.db, id);

    if (!task) {
        return { ...context, id, error: 'Task not found', status: 404 as const };
    }

    return { id, ...context, task };
}

function calculateTaskTimestamps(
    nextStatus: TaskStatus,
    nextColumn: KanbanColumn,
    currentStartAt: string | null,
    currentEndAt: string | null,
    now: string
): { startAt?: string; endAt?: string | null } {
    const isActive = nextStatus === TaskStatus.IN_PROGRESS || nextColumn === KanbanColumn.IN_PROGRESS;
    const isDone = nextStatus === TaskStatus.DONE || nextColumn === KanbanColumn.DONE;

    const timestamps: { startAt?: string; endAt?: string | null } = {};

    if (isActive && !currentStartAt) {
        timestamps.startAt = now;
    }

    if (isDone) {
        timestamps.endAt = now;
    } else if (currentEndAt) {
        timestamps.endAt = null;
    }

    return timestamps;
}

function calculateNextStatusAndColumn(
    status: TaskStatus | undefined,
    kanbanColumn: KanbanColumn | undefined,
    currentStatus: TaskStatus,
    currentColumn: KanbanColumn
): { nextStatus: TaskStatus; nextColumn: KanbanColumn } {
    let nextStatus = status ? status : currentStatus;
    let nextColumn = kanbanColumn ? kanbanColumn : currentColumn;

    if (kanbanColumn && kanbanColumn !== currentColumn) {
        const syncedStatus = StatusMapper.getSyncStatus(nextStatus, nextColumn);
        if (syncedStatus) nextStatus = syncedStatus;
    } else if (status && status !== currentStatus) {
        const syncedColumn = StatusMapper.getSyncColumn(nextColumn, nextStatus);
        if (syncedColumn) nextColumn = syncedColumn;
    }

    return { nextStatus, nextColumn };
}

function mapWorkshopTasks(workshopRows: any[]) {
    return workshopRows.flatMap(w => {
        const context = (w.taskContext || {}) as any;
        if (!context.phases || !Array.isArray(context.phases)) return [];

        return context.phases.flatMap((p: any) => {
            if (!p.tasks || !Array.isArray(p.tasks)) return [];

            return p.tasks.map((t: any) => {
                const isNotStarted = t.status === 'not_started';
                const isInProgress = t.status === 'in_progress';
                return {
                    id: `${w.id}-${p.phase_number}-${t.task_number}`,
                    repoId: w.repoId,
                    title: `[Phase ${p.phase_number}] ${t.task_title}`,
                    description: t.task_description || '',
                    status: isNotStarted ? TaskStatus.TODO :
                            isInProgress ? TaskStatus.IN_PROGRESS : TaskStatus.DONE,
                    kanbanColumn: isNotStarted ? KanbanColumn.PLANNED :
                                  isInProgress ? KanbanColumn.IN_PROGRESS : KanbanColumn.DONE,
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
    const db = getDb(c.env.DB);
    // Join with repos to get context if needed, or just return flat
    const rows = await db.select().from(tasks).where(eq(tasks.isDeleted, 0)).limit(100).orderBy(tasks.updatedAt);
    
    // Also fetch workshop tasks for global view
    const workshopRows = await db.select().from(tasks).where(eq(tasks.taskType, 'workshop_project')).limit(100);
    const mappedWorkshop = mapWorkshopTasks(workshopRows);

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

    if ('error' in ctx) {
        await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'failed', { error: ctx.error });
        return c.json({ success: false, error: ctx.error }, ctx.status);
    }
    const { owner, repo, db, requestId, now, repoRecord } = ctx;

    // 1. Create GitHub Issue
    const issue = await performGithubAction(
        db,
        repoRecord.id,
        (ownerStr, nameStr) => createGitHubIssue(c.env, ownerStr, nameStr, title, description, assignee ? [assignee] : undefined),
        { requestId, taskId: null, eventType: 'github_issue_create', githubIssueId: (res: any) => res.number, details: (res: any) => ({ html_url: res.html_url }) }
    );

    if (!issue) {
        return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500);
    }

    // 2. Create Local Task
    const newId = generateUuid();

    // Logic: Status defaults to TODO (per schema), Mapper determines column
    const initialStatus = (status as TaskStatus) || TaskStatus.TODO;
    const initialColumn = StatusMapper.mapStatusToColumn(initialStatus);

    // If initial status implies progress, set startAt
    const startAt = (initialStatus === TaskStatus.IN_PROGRESS || initialColumn === KanbanColumn.IN_PROGRESS) ? now : undefined;

    let dbError: any = null;
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
            startAt
        });
    } catch (e: any) {
        dbError = e;
    } finally {
        await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', dbError ? 'failed' : 'success', dbError ? { error: dbError.message } : undefined);
    }

    if (dbError) {
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const ctx = await getTaskContext(c);
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);
    const { id, db, requestId, now, task } = ctx;

    await logTaskEvent(db, requestId, id, task.githubIssueId, 'api_request_update_task', 'pending', body);

    // Determine final Status and KanbanColumn using Mapper
    const currentStatus = task.status as TaskStatus;
    const currentColumn = task.kanbanColumn as KanbanColumn;

    const { nextStatus, nextColumn } = calculateNextStatusAndColumn(
        status as TaskStatus,
        kanbanColumn as KanbanColumn,
        currentStatus,
        currentColumn
    );

    // Prepare DB Update Payload and GitHub Updates
    const updatePayload: any = { updatedAt: now };
    const githubUpdates: any = {};

    const processUpdate = (value: any, current: any, assign: () => void) => {
        if (value !== undefined && value !== current) assign();
    };

    processUpdate(nextStatus, currentStatus, () => {
        updatePayload.status = nextStatus;
        githubUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
    });

    processUpdate(nextColumn, currentColumn, () => {
        updatePayload.kanbanColumn = nextColumn;
    });

    processUpdate(position, task.position, () => {
        updatePayload.position = position;
    });

    processUpdate(title, task.title, () => {
        updatePayload.title = title;
        githubUpdates.title = title;
    });

    processUpdate(description, task.description, () => {
        updatePayload.description = description;
        githubUpdates.body = description;
    });

    processUpdate(assignee, task.assignee, () => {
        updatePayload.assignee = assignee;
        githubUpdates.assignees = assignee ? [assignee] : [];
    });

    // Sync to GitHub if linked and relevant fields changed
    if (task.githubIssueId && Object.keys(githubUpdates).length > 0) {
        await performGithubAction(
            db,
            task.repoId,
            (owner, name) => updateGitHubIssue(c.env, owner, name, task.githubIssueId!, githubUpdates),
            { requestId, taskId: id, eventType: 'github_issue_update', githubIssueId: task.githubIssueId, details: githubUpdates }
        );
    }

    const timestamps = calculateTaskTimestamps(nextStatus, nextColumn, task.startAt, task.endAt, now);
    if (timestamps.startAt !== undefined) updatePayload.startAt = timestamps.startAt;
    if (timestamps.endAt !== undefined) updatePayload.endAt = timestamps.endAt;

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
    const { content, author } = await c.req.json() as any;

    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);
    const { id, db, requestId, now, task } = ctx;

    // Sync to GitHub
    let githubCommentId: number | null = null;
    if (task.githubIssueId) {
        const comment = await performGithubAction(
            db,
            task.repoId,
            (owner, name) => createGitHubComment(c.env, owner, name, task.githubIssueId!, `**${author || 'User'}**: ${content}`),
            { requestId, taskId: id, eventType: 'github_comment_create', githubIssueId: task.githubIssueId }
        );
        githubCommentId = comment?.id || null;
    }

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
            (owner, name) => updateGitHubIssue(c.env, owner, name, task.githubIssueId!, { state: 'closed' }),
            { requestId, taskId: id, eventType: 'github_issue_close', githubIssueId: task.githubIssueId }
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
