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
    actionFn: (owner: string, repoName: string) => Promise<T>,
    logOptions?: {
        requestId: string;
        taskId: string | null;
        eventType: string;
        details?: any;
        githubIssueId?: number | null | ((res: T) => number | null);
    }
): Promise<T | null> {
    if (githubIssueId === null) return null;

    const repoRecord = await getRepoById(db, repoId);
    if (!repoRecord) return null;

    const { owner, name } = repoRecord;

    try {
        const result = await actionFn(owner, name);
        if (logOptions) {
            let finalIssueId = githubIssueId || null;
            if (logOptions.githubIssueId !== undefined) {
                finalIssueId = typeof logOptions.githubIssueId === 'function' ? logOptions.githubIssueId(result) : logOptions.githubIssueId;
            }
            await logTaskEvent(db, logOptions.requestId, logOptions.taskId, finalIssueId, logOptions.eventType, 'success', logOptions.details);
        }
        return result;
    } catch (e: any) {
        if (logOptions) {
            let finalIssueId = githubIssueId || null;
            if (logOptions.githubIssueId !== undefined && typeof logOptions.githubIssueId !== 'function') {
                finalIssueId = logOptions.githubIssueId;
            }
            await logTaskEvent(db, logOptions.requestId, logOptions.taskId, finalIssueId, logOptions.eventType, 'failed', { error: e.message, ...logOptions.details });
        }
        return null;
    }
}

async function getRepoById(db: ReturnType<typeof getDb>, id: string) {
    return db.select().from(repos).where(eq(repos.id, id)).limit(1).then(res => res[0] || null);
}

async function getRepoByOwnerAndName(db: ReturnType<typeof getDb>, owner: string, repo: string) {
    return db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, repo))).limit(1).then(res => res[0] || null);
}

async function getTaskById(db: ReturnType<typeof getDb>, id: string) {
    return db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then(res => res[0] || null);
}

function mapWorkshopTasks(workshopRows: any[]) {
    return workshopRows.flatMap(w => {
        const phases = Array.isArray((w.taskContext as any)?.phases) ? (w.taskContext as any).phases : [];

        return phases.flatMap((p: any) => {
            const tasks = Array.isArray(p?.tasks) ? p.tasks : [];

            return tasks.map((t: any) => {
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

function getBaseContext(c: Context<{ Bindings: Bindings }>) {
    return {
        db: getDb(c.env.DB),
        requestId: generateUuid(),
        now: new Date().toISOString()
    };
}

async function getRepoContext(c: Context<{ Bindings: Bindings }>) {
    const { owner, repo } = c.req.param();
    const base = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(base.db, owner, repo);
    if (!repoRecord) return { error: 'Repo not found', status: 404 as const, owner, repo, ...base, repoRecord: null as any };
    return { owner, repo, ...base, repoRecord: repoRecord! };
}

async function getTaskContext(c: Context<{ Bindings: Bindings }>) {
    const { id } = c.req.param();
    const base = getBaseContext(c);
    const task = await getTaskById(base.db, id);
    if (!task) return { error: 'Task not found', status: 404 as const, id, ...base, task: null as any };
    return { id, ...base, task: task! };
}

function calculateTaskTimestamps(status: TaskStatus, column: KanbanColumn, currentStartAt: string | null, currentEndAt: string | null, now: string) {
    const isActive = status === TaskStatus.IN_PROGRESS || column === KanbanColumn.IN_PROGRESS;
    const isDone = status === TaskStatus.DONE || column === KanbanColumn.DONE;

    let startAt = currentStartAt;
    let endAt = currentEndAt;

    if (isActive && !startAt) {
        startAt = now;
    }

    if (isDone) {
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
    const body = await c.req.json();
    const { title, description, status, assignee } = body as any;

    const ctx = await getRepoContext(c);
    const { db, requestId, now, owner, repo, repoRecord } = ctx;

    // Log API Request
    await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'pending', { owner, repo, body });

    if ('error' in ctx) {
        await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'failed', { error: ctx.error });
        return c.json({ success: false, error: ctx.error }, ctx.status);
    }

    // 1. Create GitHub Issue
    const issue = await performGithubAction(
        db,
        repoRecord.id,
        undefined,
        (owner, name) => createGitHubIssue(c.env, owner, name, title, description, assignee ? [assignee] : undefined),
        { requestId, taskId: null, eventType: 'github_issue_create', githubIssueId: (res: any) => res?.number || null }
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
    const { startAt } = calculateTaskTimestamps(initialStatus, initialColumn, null, null, now);

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
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);

    const { db, requestId, now, id, task } = ctx;
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
    // 2. If Status Changed, does Column need to sync? (Priority driven by what was passed)
    // If BOTH passed, Mapper shouldn't override explicit values unless strictly invalid? 
    // Let's assume explicit input wins, but if only one passed, we sync the other.
    else if (status && status !== currentStatus) {
        const syncedColumn = StatusMapper.getSyncColumn(nextColumn, nextStatus);
        if (syncedColumn) nextColumn = syncedColumn;
    }

    // Prepare DB Update Payload and GitHub Updates
    const updatePayload: any = { updatedAt: now };
    const githubUpdates: any = {};

    if (nextStatus !== currentStatus) {
        updatePayload.status = nextStatus;
        githubUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
    }
    if (nextColumn !== currentColumn) updatePayload.kanbanColumn = nextColumn;
    if (position !== undefined) updatePayload.position = position;

    if (title !== undefined && title !== task.title) {
        updatePayload.title = title;
        githubUpdates.title = title;
    }
    if (description !== undefined && description !== task.description) {
        updatePayload.description = description;
        githubUpdates.body = description;
    }
    if (assignee !== undefined && assignee !== task.assignee) {
        updatePayload.assignee = assignee;
        githubUpdates.assignees = assignee ? [assignee] : [];
    }

    // Sync to GitHub if linked and relevant fields changed
    if (task.githubIssueId && Object.keys(githubUpdates).length > 0) {
        const issueId = task.githubIssueId;
        await performGithubAction(
            db,
            task.repoId,
            issueId,
            (owner, name) => updateGitHubIssue(c.env, owner, name, issueId, githubUpdates),
            { requestId, taskId: id, eventType: 'github_issue_update', details: githubUpdates }
        );
    }

    const timestamps = calculateTaskTimestamps(nextStatus, nextColumn, task.startAt, task.endAt, now);
    if (timestamps.startAt !== task.startAt) updatePayload.startAt = timestamps.startAt;
    if (timestamps.endAt !== task.endAt) updatePayload.endAt = timestamps.endAt;

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
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);

    const { db, requestId, now, id, task } = ctx;
    const { content, author } = await c.req.json() as any;

    // Sync to GitHub
    const issueId = task.githubIssueId;
    const comment = await performGithubAction(
        db,
        task.repoId,
        issueId,
        (owner, name) => {
            if (!issueId) return Promise.resolve(null);
            return createGitHubComment(c.env, owner, name, issueId, `**${author || 'User'}**: ${content}`);
        },
        { requestId, taskId: id, eventType: 'github_comment_create' }
    );
    const githubCommentId = (comment as any)?.id || null;

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

    const { db, requestId, now, id, task } = ctx;

    if (task.githubIssueId) {
        const issueId = task.githubIssueId;
        await performGithubAction(
            db,
            task.repoId,
            issueId,
            (owner, name) => updateGitHubIssue(c.env, owner, name, issueId, { state: 'closed' }),
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
