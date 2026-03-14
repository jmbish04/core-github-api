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
 * Execute a GitHub Action.
 */
async function performGithubAction<T>(
    db: ReturnType<typeof getDb>,
    actionFn: () => Promise<T>,
    logOptions?: {
        requestId: string;
        eventType: string;
        taskId?: string | null;
        issueNumber?: number | ((res: T) => number);
        details?: any;
    }
): Promise<T | null> {
    let result: T | null = null;
    let errorMsg: string | undefined;
    let isSuccess = false;

    try {
        result = await actionFn();
        isSuccess = !!result;
    } catch (e: any) {
        errorMsg = e.message;
    } finally {
        if (logOptions) {
            let logIssueNumber: number | null = null;
            if (typeof logOptions.issueNumber === 'function') {
                logIssueNumber = result ? logOptions.issueNumber(result) : null;
            } else if (logOptions.issueNumber !== undefined) {
                logIssueNumber = logOptions.issueNumber;
            }

            await logTaskEvent(
                db,
                logOptions.requestId,
                logOptions.taskId || null,
                logIssueNumber,
                logOptions.eventType,
                isSuccess ? 'success' : 'failed',
                errorMsg ? { error: errorMsg, ...logOptions.details } : logOptions.details
            );
        }
    }

    return result;
}

async function getRepoById(db: ReturnType<typeof getDb>, id: string) {
    return await db.select().from(repos).where(eq(repos.id, id)).limit(1).then(res => res[0] || null);
}

async function getRepoByOwnerAndName(db: ReturnType<typeof getDb>, owner: string, name: string) {
    return await db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1).then(res => res[0] || null);
}

async function getTaskById(db: ReturnType<typeof getDb>, id: string) {
    return await db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then(res => res[0] || null);
}

function getBaseContext(c: Context<{ Bindings: Bindings }>) {
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
    } else if (endAt) {
        endAt = null; // Reset if moving out of done
    }

    return { startAt, endAt };
}

async function getTaskContext(c: Context<{ Bindings: Bindings }>, id: string) {
    const baseCtx = getBaseContext(c);
    const task = await getTaskById(baseCtx.db, id);

    if (!task) return { error: 'Task not found', status: 404 as const, ...baseCtx };

    const repoRecord = task.repoId ? await getRepoById(baseCtx.db, task.repoId) : null;
    return { task, repoRecord, ...baseCtx };
}

async function getRepoContext(c: Context<{ Bindings: Bindings }>, owner: string, repo: string) {
    const baseCtx = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(baseCtx.db, owner, repo);

    if (!repoRecord) return { error: 'Repo not found', status: 404 as const, ...baseCtx };

    return { repoRecord, ...baseCtx };
}

async function updateLocalTask(db: ReturnType<typeof getDb>, task: any, payload: any, requestId: string, eventType: string) {
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

    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);

    const rows = await ctx.db.select().from(tasks).where(and(eq(tasks.repoId, ctx.repoRecord.id), eq(tasks.isDeleted, 0)));
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
    
    // Fetch all relevant tasks in a single query
    const allTasks = await db.select()
        .from(tasks)
        .where(eq(tasks.isDeleted, 0))
        .limit(100)
        .orderBy(tasks.updatedAt);

    const rows = allTasks.filter(t => t.taskType !== 'workshop_project');
    const workshopRows = allTasks.filter(t => t.taskType === 'workshop_project');

    // Also fetch workshop tasks for global view
    const mappedWorkshop = workshopRows.flatMap(w => {
        const phases = ((w.taskContext || {}) as any).phases || [];
        return (Array.isArray(phases) ? phases : []).flatMap((p: any) => {
            const pTasks = p.tasks || [];
            return (Array.isArray(pTasks) ? pTasks : []).map((t: any) => {
                const mappedStatus = t.status === 'not_started' ? TaskStatus.TODO : (t.status === 'in_progress' ? TaskStatus.IN_PROGRESS : TaskStatus.DONE);
                return {
                    id: `${w.id}-${p.phase_number}-${t.task_number}`,
                    repoId: w.repoId,
                    title: `[Phase ${p.phase_number}] ${t.task_title}`,
                    description: t.task_description || '',
                    status: mappedStatus,
                    kanbanColumn: mappedStatus === TaskStatus.TODO ? KanbanColumn.PLANNED : StatusMapper.mapStatusToColumn(mappedStatus),
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

    // Log API Request
    await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'pending', { owner, repo, body });

    if ('error' in ctx) {
        await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'failed', { error: ctx.error });
        return c.json({ success: false, error: ctx.error }, ctx.status);
    }

    const { db, requestId, now, repoRecord } = ctx;

    // 1. Create GitHub Issue
    const issue = await performGithubAction(
        db,
        () => createGitHubIssue(c.env, owner, repo, title, description, assignee ? [assignee] : undefined),
        {
            requestId,
            eventType: 'github_issue_create',
            issueNumber: (res: any) => res.number
        }
    );

    if (!issue) return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500);

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
    } catch (e: any) {
        await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', 'failed', { error: e.message });
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', 'success');

    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    
    const ctx = await getTaskContext(c, id);
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);

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
    // 2. If Status Changed, does Column need to sync? (Priority driven by what was passed)
    // If BOTH passed, Mapper shouldn't override explicit values unless strictly invalid? 
    // Let's assume explicit input wins, but if only one passed, we sync the other.
    else if (status && status !== currentStatus) {
        const syncedColumn = StatusMapper.getSyncColumn(nextColumn, nextStatus);
        if (syncedColumn) nextColumn = syncedColumn;
    }

    // Update Timestamps
    const { startAt, endAt } = calculateTaskTimestamps(nextStatus, nextColumn, now, task.startAt, task.endAt);

    // Prepare DB Update Payload and GitHub Updates
    const updatePayload: any = { updatedAt: now };
    const githubUpdates: any = {};

    const processUpdate = <K extends keyof typeof task, G extends string>(
        newValue: any,
        taskKey: K,
        dbKey: string = taskKey,
        ghKey?: G,
        ghValue?: any
    ) => {
        if (newValue !== undefined && newValue !== task[taskKey]) {
            updatePayload[dbKey] = newValue;
            if (ghKey) githubUpdates[ghKey] = ghValue !== undefined ? ghValue : newValue;
        }
    };

    if (nextStatus !== currentStatus) {
        updatePayload.status = nextStatus;
        githubUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
    }
    if (nextColumn !== currentColumn) updatePayload.kanbanColumn = nextColumn;

    processUpdate(startAt, 'startAt');
    processUpdate(endAt, 'endAt');
    processUpdate(position, 'position');
    processUpdate(title, 'title', 'title', 'title');
    processUpdate(description, 'description', 'description', 'body');
    processUpdate(assignee, 'assignee', 'assignee', 'assignees', assignee ? [assignee] : []);

    // Determines updates for GitHub
    // Sync to GitHub if linked
    if (task.githubIssueId && repoRecord && Object.keys(githubUpdates).length > 0) {
        // If state is not updated but needed, add it
        if (!githubUpdates.state) {
            githubUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
        }

        await performGithubAction(
            db,
            () => updateGitHubIssue(c.env, repoRecord.owner, repoRecord.name, task.githubIssueId as number, githubUpdates),
            { requestId, taskId: id, issueNumber: task.githubIssueId, eventType: 'github_issue_update', details: githubUpdates }
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
    const githubComment = (task.githubIssueId && repoRecord) ? await performGithubAction(
        db,
        () => createGitHubComment(c.env, repoRecord.owner, repoRecord.name, task.githubIssueId as number, `**${author || 'User'}**: ${content}`),
        { requestId, taskId: id, issueNumber: task.githubIssueId, eventType: 'github_comment_create' }
    ) : null;
    const githubCommentId = githubComment?.id || null;

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

    if (task.githubIssueId && repoRecord) {
        await performGithubAction(
            db,
            () => updateGitHubIssue(c.env, repoRecord.owner, repoRecord.name, task.githubIssueId as number, { state: 'closed' }),
            { requestId, taskId: id, issueNumber: task.githubIssueId, eventType: 'github_issue_close' }
        );
    }

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
