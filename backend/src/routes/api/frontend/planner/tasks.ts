// src/routes/api/tasks.ts
import { Hono, Context } from 'hono';
import { Bindings } from '@utils/hono';
import { getDb } from '@db';
import { tasks, repos, taskEvents, taskComments, workshopProjectTasks } from '@db/schema';
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

const tasksApi = new Hono<{ Bindings: Bindings }>();

/**
 * Shared Request Context Setup
 */
function getRequestContext(c: Context<{ Bindings: Bindings }>) {
    return {
        db: getDb(c.env.DB),
        requestId: crypto.randomUUID(),
        now: new Date().toISOString()
    };
}

/**
 * Common DB queries for single records
 */
const getRepoByOwnerAndName = (db: ReturnType<typeof getDb>, owner: string, name: string) =>
    db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1).then(res => res[0] || null);

const getRepoById = (db: ReturnType<typeof getDb>, id: string) =>
    db.select().from(repos).where(eq(repos.id, id)).limit(1).then(res => res[0] || null);

const getTaskById = (db: ReturnType<typeof getDb>, id: string) =>
    db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then(res => res[0] || null);

const getTaskContext = async (c: Context<{ Bindings: Bindings }>) => {
    const { id } = c.req.param();
    const ctx = getRequestContext(c);
    const task = await getTaskById(ctx.db, id);

    if (!task) return { error: 'Task not found', status: 404 };
    return { ...ctx, id, task };
};

/**
 * Shared GitHub Execution Wrapper
 */
async function executeGithubAction<T>(
    db: ReturnType<typeof getDb>,
    requestId: string,
    taskId: string | null,
    eventType: string,
    actionFn: () => Promise<T>,
    logOptions?: { details?: any; issueNumber?: number | ((res: T) => number) }
): Promise<T | null> {
    try {
        const result = await actionFn();
        if (result) {
            const issueNumber =
                typeof logOptions?.issueNumber === 'function'
                    ? logOptions.issueNumber(result)
                    : logOptions?.issueNumber || null;
            await logTaskEvent(db, requestId, taskId, issueNumber, eventType, 'success', logOptions?.details);
            return result;
        }
        await logTaskEvent(db, requestId, taskId, null, eventType, 'failed', logOptions?.details);
        return null;
    } catch (e: any) {
        await logTaskEvent(db, requestId, taskId, null, eventType, 'failed', { error: e.message, ...logOptions?.details });
        return null;
    }
}

async function performTaskGithubAction<T>(
    c: Context<{ Bindings: Bindings }>,
    task: any,
    eventType: string,
    actionFn: (owner: string, name: string) => Promise<T>,
    logOptions?: { details?: any }
) {
    const { db, requestId } = getRequestContext(c);
    if (!task.githubIssueId || !task.repoId) return null;

    const repoRecord = await getRepoById(db, task.repoId);
    if (!repoRecord) return null;

    return executeGithubAction(db, requestId, task.id, eventType, () => actionFn(repoRecord.owner, repoRecord.name), {
        ...logOptions,
        issueNumber: task.githubIssueId
    });
}

function calculateTaskTimestamps(task: any, nextStatus: TaskStatus, nextColumn: KanbanColumn, now: string) {
    let { startAt, endAt } = task;

    if ((nextStatus === TaskStatus.IN_PROGRESS || nextColumn === KanbanColumn.IN_PROGRESS) && !startAt) {
        startAt = now;
    }

    if ((nextStatus as TaskStatus) === TaskStatus.DONE || (nextColumn as KanbanColumn) === KanbanColumn.DONE) {
        endAt = now;
    } else if ((nextStatus as TaskStatus) !== TaskStatus.DONE && (nextColumn as KanbanColumn) !== KanbanColumn.DONE && endAt) {
        endAt = null;
    }

    return { startAt, endAt };
}

// GET /api/repos/:owner/:repo/tasks
tasksApi.get('/repos/:owner/:repo/tasks', async (c) => {
    const { owner, repo } = c.req.param();
    const { db } = getRequestContext(c);

    // Resolve repo ID
    const repoRecord = await getRepoByOwnerAndName(db, owner, repo);

    if (!repoRecord) {
        return c.json({ success: false, error: 'Repo not found' }, 404);
    }

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
    const { db } = getRequestContext(c);
    // Join with repos to get context if needed, or just return flat
    const rows = await db.select().from(tasks).where(eq(tasks.isDeleted, 0)).limit(100).orderBy(tasks.updatedAt);
    
    // Also fetch workshop tasks for global view
    const workshopRows = await db.select().from(workshopProjectTasks).limit(100);
    const mappedWorkshop = workshopRows.flatMap(w =>
        (Array.isArray(w.phases) ? w.phases : []).flatMap((p: any) =>
            (Array.isArray(p.tasks) ? p.tasks : []).map((t: any) => {
                const isNotStarted = t.status === 'not_started';
                const isInProgress = t.status === 'in_progress';

                return {
                    id: `${w.id}-${p.phase_number}-${t.task_number}`,
                    repoId: w.projectId,
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
            })
        )
    );

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
    const { db, requestId, now } = getRequestContext(c);

    // Log API Request
    await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'pending', { owner, repo, body });

    const repoRecord = await getRepoByOwnerAndName(db, owner, repo);
    if (!repoRecord) {
        await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'failed', { error: 'Repo not found' });
        return c.json({ success: false, error: 'Repo not found' }, 404);
    }

    // 1. Create GitHub Issue using executeGithubAction wrapper
    const issue = await executeGithubAction(
        db,
        requestId,
        null, // No local task ID yet
        'github_issue_create',
        () => createGitHubIssue(c.env, owner, repo, title, description, assignee ? [assignee] : undefined),
        { issueNumber: (res: any) => res.number }
    );

    if (!issue) {
        return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500);
    }

    // 2. Create Local Task
    const newId = crypto.randomUUID();

    // Logic: Status defaults to TODO (per schema), Mapper determines column
    const initialStatus = (status as TaskStatus) || TaskStatus.TODO;
    const initialColumn = StatusMapper.mapStatusToColumn(initialStatus);

    let startAt: string | undefined;

    // If initial status implies progress, set startAt
    if (initialStatus === TaskStatus.IN_PROGRESS || initialColumn === KanbanColumn.IN_PROGRESS) {
        startAt = now;
    }

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
            startAt: startAt
        });
        await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', 'success');
    } catch (e: any) {
        await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', 'failed', { error: e.message });
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const ctx = await getTaskContext(c);
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status as any);

    const { db, requestId, id, task, now } = ctx;
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;

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

    const { startAt, endAt } = calculateTaskTimestamps(task, nextStatus, nextColumn, now);

    // Prepare DB and GitHub Update Payloads
    const updatePayload: any = { updatedAt: now, startAt, endAt };
    const updates: any = {};

    const syncField = <K extends keyof typeof updatePayload>(
        key: K,
        value: any,
        currentValue: any,
        ghKey?: string,
        ghValueFn?: (v: any) => any,
        requireTruthForGithub = false
    ) => {
        if (value !== undefined && value !== currentValue) {
            updatePayload[key] = value;
            if (ghKey && (!requireTruthForGithub || value)) {
                updates[ghKey] = ghValueFn ? ghValueFn(value) : value;
            }
        }
    };

    syncField('status', nextStatus, currentStatus, 'state', (v) => v === TaskStatus.DONE ? 'closed' : 'open', true);
    syncField('kanbanColumn', nextColumn, currentColumn);
    syncField('position', position, task.position);
    syncField('title', title, task.title, 'title', undefined, true);
    syncField('description', description, task.description, 'body', undefined, true);
    syncField('assignee', assignee, task.assignee, 'assignees', (v) => v ? [v] : []);

    // Perform external GitHub updates conditionally before local DB update
    if (Object.keys(updates).length > 0 && task.githubIssueId) {
        await performTaskGithubAction(c, task, 'github_issue_update', (owner, name) =>
            updateGitHubIssue(c.env, owner, name, task.githubIssueId!, updates),
            { details: updates }
        );
    }

    // Update Local DB
    await db.update(tasks).set(updatePayload).where(eq(tasks.id, id));
    await logTaskEvent(db, requestId, id, task.githubIssueId, 'db_task_update', 'success');

    return c.json({ success: true });
});

// POST /api/tasks/:id/comments
tasksApi.post('/tasks/:id/comments', async (c) => {
    const ctx = await getTaskContext(c);
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status as any);

    const { db, requestId, id, task, now } = ctx;
    const { content, author } = await c.req.json() as any;

    // Sync to GitHub
    const comment = await performTaskGithubAction(c, task, 'github_comment_create', (owner, name) =>
        createGitHubComment(c.env, owner, name, task.githubIssueId!, `**${author || 'User'}**: ${content}`)
    );

    // Save Local
    const commentId = crypto.randomUUID();
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
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status as any);

    const { db, requestId, id, task, now } = ctx;

    await performTaskGithubAction(c, task, 'github_issue_close', (owner, name) =>
        updateGitHubIssue(c.env, owner, name, task.githubIssueId!, { state: 'closed' })
    );

    await db.update(tasks).set({ isDeleted: 1, updatedAt: now }).where(eq(tasks.id, id));

    await logTaskEvent(db, requestId, id, task.githubIssueId, 'db_task_soft_delete', 'success');

    return c.json({ success: true });
});

export default tasksApi;
