// src/routes/api/tasks.ts
import { Hono, Context } from 'hono';
import { Bindings } from '@utils/hono';
import { getDb } from '@db';
import { tasks, taskEvents, taskComments } from '@db/schemas/projects/tasks';
import { repos } from '@db/schemas/github/repos';
import { eq, and, or } from 'drizzle-orm';
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
    actionFn: (owner: string, repoName: string, issueNumber: number | null) => Promise<T>,
    logOptions?: {
        requestId: string;
        taskId: string | null;
        eventType: string;
        githubIssueId?: number | null;
        getIssueId?: (result: T) => number | null;
        details?: any;
    }
): Promise<T | null> {
    const repoRecord = await getRepoById(db, repoId);
    if (!repoRecord) return null;

    const { owner, name } = repoRecord;

    let result = null as T | null;
    let actionError = null;
    let isSuccess = false;

    try {
        result = await actionFn(owner, name, logOptions?.githubIssueId || null);
        isSuccess = !!result;
    } catch (e: any) {
        actionError = e.message;
    }

    if (logOptions) {
        const details = actionError ? { error: actionError, ...logOptions.details } : logOptions.details;
        const resolvedIssueId = logOptions.getIssueId && result ? logOptions.getIssueId(result) : (logOptions.githubIssueId || null);

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

function calculateTaskTimestamps(
    status: TaskStatus,
    column: KanbanColumn,
    now: string,
    currentStartAt?: string | null,
    currentEndAt?: string | null
): { startAt?: string; endAt?: string | null } {
    const isInProgress = status === TaskStatus.IN_PROGRESS || column === KanbanColumn.IN_PROGRESS;
    const isDone = status === TaskStatus.DONE || column === KanbanColumn.DONE;

    const timestamps: { startAt?: string; endAt?: string | null } = {};

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


async function getRepoContext(c: Context<{ Bindings: Bindings }>) {
    const { owner, repo } = c.req.param();
    const baseCtx = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(baseCtx.db, owner, repo);
    if (!repoRecord) return { error: 'Repo not found', status: 404, owner, repo, ...baseCtx, repoRecord };
    return { owner, repo, ...baseCtx, repoRecord };
}

async function getTaskContext(c: Context<{ Bindings: Bindings }>) {
    const { id } = c.req.param();
    const baseCtx = getBaseContext(c);
    const task = await getTaskById(baseCtx.db, id);
    if (!task) return { error: 'Task not found', status: 404, id, ...baseCtx, task };
    return { id, ...baseCtx, task };
}

const tasksApi = new Hono<{ Bindings: Bindings }>();

// GET /api/repos/:owner/:repo/tasks
tasksApi.get('/repos/:owner/:repo/tasks', async (c) => {
    const ctx = await getRepoContext(c);
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status as any);

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
    // Fetch active tasks and workshop tasks in a single query
    const allRows = await db.select().from(tasks)
        .where(or(eq(tasks.isDeleted, 0), eq(tasks.taskType, 'workshop_project')))
        .limit(200)
        .orderBy(tasks.updatedAt);

    const rows = allRows.filter(r => r.isDeleted === 0 && r.taskType !== 'workshop_project');
    const workshopRows = allRows.filter(r => r.taskType === 'workshop_project');

    const mappedWorkshop = workshopRows.flatMap(w => {
        const phases = (w.taskContext as any)?.phases;
        return (Array.isArray(phases) ? phases : []).flatMap((p: any) => {
            return (Array.isArray(p.tasks) ? p.tasks : []).map((t: any) => {
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
    const ctx = await getRepoContext(c);

    if ('error' in ctx) {
        await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'failed', { error: ctx.error });
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }

    const { db, requestId, now, owner, repo, repoRecord } = ctx;

    // Log API Request
    await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'pending', { owner, repo, body });

    // 1. Create GitHub Issue
    const issue = await performGithubAction(
        db,
        repoRecord.id,
        (ownerName, repoName) => createGitHubIssue(c.env, ownerName, repoName, title, description, assignee ? [assignee] : undefined),
        { requestId, taskId: null, eventType: 'github_issue_create', getIssueId: (res) => res?.number || null }
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

    await logTaskEvent(
        db,
        requestId,
        newId,
        issue.number,
        'db_task_create',
        dbError ? 'failed' : 'success',
        dbError ? { error: dbError } : undefined
    );

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

    if ('error' in ctx) {
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }

    const { db, requestId, now, id, task } = ctx;

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

    // Prepare Local DB Update Payload and GitHub Updates
    const updatePayload: any = { updatedAt: now };
    const githubUpdates: any = {};

    if (nextStatus !== currentStatus) {
        updatePayload.status = nextStatus;
        if (nextStatus === TaskStatus.DONE) githubUpdates.state = 'closed';
        else githubUpdates.state = 'open';
    }

    if (nextColumn !== currentColumn) {
        updatePayload.kanbanColumn = nextColumn;
    }

    // Helper to process generic updates
    const processUpdate = <K extends keyof typeof updatePayload, G extends keyof typeof githubUpdates>(
        inputVal: any,
        taskVal: any,
        localKey: K,
        githubKey?: G,
        githubTransform?: (v: any) => any
    ) => {
        if (inputVal !== undefined && inputVal !== taskVal) {
            updatePayload[localKey] = inputVal;
            if (githubKey) {
                githubUpdates[githubKey] = githubTransform ? githubTransform(inputVal) : inputVal;
            }
        }
    };

    processUpdate(position, task.position, 'position');
    processUpdate(title, task.title, 'title', 'title');
    processUpdate(description, task.description, 'description', 'body');
    processUpdate(assignee, task.assignee, 'assignee', 'assignees', v => (v ? [v] : []));

    // Sync to GitHub if linked and there are updates
    if (task.githubIssueId && Object.keys(githubUpdates).length > 0) {
        await performGithubAction(
            db,
            task.repoId,
            (owner, name, issueNumber) => updateGitHubIssue(c.env, owner, name, issueNumber!, githubUpdates),
            { requestId, taskId: id, eventType: 'github_issue_update', githubIssueId: task.githubIssueId, details: githubUpdates }
        );
    }

    // Logic: Calculate startAt and endAt based on state
    const timestamps = calculateTaskTimestamps(nextStatus, nextColumn, now, task.startAt, task.endAt);
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
    const { content, author } = await c.req.json() as any;
    const ctx = await getTaskContext(c);

    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status as any);

    const { db, requestId, now, id, task } = ctx;

    // Sync to GitHub
    const githubComment = task.githubIssueId ? await performGithubAction(
        db,
        task.repoId,
        (owner, name, issueNumber) => createGitHubComment(c.env, owner, name, issueNumber!, `**${author || 'User'}**: ${content}`),
        { requestId, taskId: id, eventType: 'github_comment_create', githubIssueId: task.githubIssueId }
    ) : null;

    // Save Local
    const commentId = generateUuid();
    await db.insert(taskComments).values({
        id: commentId,
        taskId: id,
        content,
        author: author || 'system',
        githubCommentId: githubComment?.id || null,
        createdAt: now,
        updatedAt: now
    });

    return c.json({ success: true, id: commentId });
});

// DELETE /api/tasks/:id (Soft delete)
tasksApi.delete('/tasks/:id', async (c) => {
    const ctx = await getTaskContext(c);

    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status as any);

    const { db, requestId, now, id, task } = ctx;

    if (task.githubIssueId) {
        await performGithubAction(
            db,
            task.repoId,
            (owner, name, issueNumber) => updateGitHubIssue(c.env, owner, name, issueNumber!, { state: 'closed' }),
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
