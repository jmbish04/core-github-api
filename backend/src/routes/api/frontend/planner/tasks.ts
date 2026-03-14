// src/routes/api/tasks.ts
import { Hono } from 'hono';
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
 * Executes a GitHub action and logs the result.
 */
async function executeGithubAction(
    db: any,
    actionFn: () => Promise<any>,
    logOptions?: {
        requestId: string;
        taskId: string | null;
        githubIssueId: number | null;
        eventType: string;
        details?: any;
    }
) {
    let result = null;
    let error: any = null;

    try {
        result = await actionFn();
    } catch (e: any) {
        error = e;
    } finally {
        if (logOptions) {
            const status = result ? 'success' : 'failed';
            const finalIssueId = result?.number || result?.id || logOptions.githubIssueId;
            const details = error ? { error: error.message, ...logOptions.details } : { ...(result?.html_url ? { html_url: result.html_url } : {}), ...logOptions.details };
            await logTaskEvent(db, logOptions.requestId, logOptions.taskId, finalIssueId, logOptions.eventType, status, Object.keys(details).length ? details : undefined);
        }
    }

    return result;
}

/**
 * Execute a GitHub Action if the task is linked to a repository.
 */
async function performTaskGithubAction(
    db: any,
    task: any,
    actionFn: (owner: string, repoName: string, issueNumber: number) => Promise<any>,
    logOptions?: {
        requestId: string;
        taskId: string | null;
        eventType: string;
        details?: any;
    }
) {
    if (!task || !task.githubIssueId) return null;

    const repo = await getRepoById(db, task.repoId);
    if (!repo) return null;

    const { owner, name } = repo;

    return executeGithubAction(db, () => actionFn(owner, name, task.githubIssueId), logOptions ? { ...logOptions, githubIssueId: task.githubIssueId } : undefined);
}

async function getRepoById(db: any, id: string) {
    const rows = await db.select().from(repos).where(eq(repos.id, id)).limit(1);
    return rows[0] || null;
}

async function getRepoByOwnerAndName(db: any, owner: string, name: string) {
    const rows = await db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1);
    return rows[0] || null;
}

async function getTaskById(db: any, id: string) {
    const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return rows[0] || null;
}


function calculateTaskTimestamps(
    status: TaskStatus,
    column: KanbanColumn,
    now: string,
    currentStartAt?: string | null,
    currentEndAt?: string | null
) {
    const isActive = status === TaskStatus.IN_PROGRESS || column === KanbanColumn.IN_PROGRESS;
    const isDone = status === TaskStatus.DONE || column === KanbanColumn.DONE;

    let startAt = currentStartAt;
    let endAt = currentEndAt;

    if (isActive && !startAt) {
        startAt = now;
    }

    if (isDone) {
        endAt = now;
    } else if (!isDone && endAt) {
        endAt = null;
    }

    return { startAt, endAt };
}

const tasksApi = new Hono<{ Bindings: Env }>();

function getRequestContext(c: any) {
    return {
        db: getDb(c.env.DB),
        requestId: generateUuid(),
        now: new Date().toISOString()
    };
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
    const workshopRows = await db.select().from(tasks).where(eq(tasks.taskType, 'workshop_project')).limit(100);
    const mappedWorkshop = workshopRows.flatMap(w => {
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

    // 1. Create GitHub Issue
    const issue = await executeGithubAction(
        db,
        () => createGitHubIssue(c.env, owner, repo, title, description, assignee ? [assignee] : undefined),
        { requestId, taskId: null, githubIssueId: null, eventType: 'github_issue_create' }
    );

    if (!issue) {
        return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500);
    }

    // 2. Create Local Task
    const newId = generateUuid();

    // Logic: Status defaults to TODO (per schema), Mapper determines column
    const initialStatus = (status as TaskStatus) || TaskStatus.TODO;
    const initialColumn = StatusMapper.mapStatusToColumn(initialStatus);

    const { startAt } = calculateTaskTimestamps(initialStatus, initialColumn, now);

    let saveError: any = null;
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
    } catch (e: any) {
        saveError = e;
    } finally {
        await logTaskEvent(
            db,
            requestId,
            newId,
            issue.number,
            'db_task_create',
            saveError ? 'failed' : 'success',
            saveError ? { error: saveError.message } : undefined
        );
    }

    if (saveError) {
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    const { db, requestId, now } = getRequestContext(c);

    // Get current task
    const task = await getTaskById(db, id);
    
    // Check if it's a workshop task
    if (!task) {
        return c.json({ success: false, error: 'Task not found' }, 404);
    }
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

    // Prepare Update Payloads (Local & GitHub)
    const updatePayload: any = { updatedAt: now };
    const githubUpdates: any = {};

    if (nextStatus !== currentStatus) {
        updatePayload.status = nextStatus;
        githubUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
    }

    // We should sync state regardless if targetStatus is passed, mimicking old behavior
    if (status !== undefined) {
        const targetStatus = (status as TaskStatus) || task.status as TaskStatus;
        githubUpdates.state = targetStatus === TaskStatus.DONE ? 'closed' : 'open';
    }

    if (nextColumn !== currentColumn) updatePayload.kanbanColumn = nextColumn;

    if (position !== undefined) updatePayload.position = position;

    if (title !== undefined) {
        updatePayload.title = title;
        githubUpdates.title = title;
    }

    if (description !== undefined) {
        updatePayload.description = description;
        githubUpdates.body = description;
    }

    if (assignee !== undefined) {
        updatePayload.assignee = assignee;
        githubUpdates.assignees = assignee ? [assignee] : [];
    }

    const { startAt, endAt } = calculateTaskTimestamps(nextStatus, nextColumn, now, task.startAt, task.endAt);
    if (startAt !== task.startAt) updatePayload.startAt = startAt;
    if (endAt !== task.endAt) updatePayload.endAt = endAt;

    // Sync to GitHub if linked
    if (task.githubIssueId && Object.keys(githubUpdates).length > 0) {
        await performTaskGithubAction(
            db,
            task,
            async (owner, name, issueNumber) => await updateGitHubIssue(c.env, owner, name, issueNumber, githubUpdates),
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
    const { id } = c.req.param();
    const { content, author } = await c.req.json() as any;
    const { db, requestId, now } = getRequestContext(c);

    const task = await getTaskById(db, id);
    if (!task) return c.json({ success: false, error: 'Task not found' }, 404);

    // Sync to GitHub
    let githubCommentId: number | null = null;
    await performTaskGithubAction(
        db,
        task,
        async (owner, name, issueNumber) => {
            const comment = await createGitHubComment(c.env, owner, name, issueNumber, `**${author || 'User'}**: ${content}`);
            if (comment) githubCommentId = comment.id;
            return comment;
        },
        { requestId, taskId: id, eventType: 'github_comment_create' }
    );

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
    const { db, requestId, now } = getRequestContext(c);

    const task = await getTaskById(db, id);
    if (!task) return c.json({ success: false, error: 'Task not found' }, 404);

    if (task.githubIssueId) {
        await performTaskGithubAction(
            db,
            task,
            async (owner, name, issueNumber) => await updateGitHubIssue(c.env, owner, name, issueNumber, { state: 'closed' }),
            { requestId, taskId: id, eventType: 'github_issue_close' }
        );
    }

    await db.update(tasks)
        .set({
            isDeleted: 1,
            updatedAt: now
        })
        .where(eq(tasks.id, id));

    await logTaskEvent(db, requestId, id, task.githubIssueId, 'db_task_soft_delete', 'success');

    return c.json({ success: true });
});

export default tasksApi;
