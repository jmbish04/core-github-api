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
    actionFn: (owner: string, repoName: string, issueNumber?: number) => Promise<T | null>,
    repoOrId: string | { owner: string; name: string },
    logOptions: {
        requestId: string;
        taskId: string | null;
        githubIssueId?: number | null | ((res: T) => number | null);
        eventType: string;
        details?: any | ((res: T) => any);
    },
    issueId?: number | null
): Promise<T | null> {
    if (issueId === null) return null;

    let owner: string;
    let name: string;

    if (typeof repoOrId === 'string') {
        const repoRecord = await getRepoById(db, repoOrId);
        if (!repoRecord) return null;
        owner = repoRecord.owner;
        name = repoRecord.name;
    } else {
        owner = repoOrId.owner;
        name = repoOrId.name;
    }

    let result: T | null = null;
    let actionError = null;

    try {
        result = await actionFn(owner, name, issueId !== undefined ? issueId : undefined);
    } catch (e: any) {
        actionError = e.message;
    }

    const isSuccess = !!result;

    let finalIssueId: number | null = null;
    if (logOptions.githubIssueId !== undefined) {
        if (typeof logOptions.githubIssueId === 'function') {
            finalIssueId = isSuccess ? logOptions.githubIssueId(result as T) : null;
        } else {
            finalIssueId = logOptions.githubIssueId;
        }
    } else if (issueId !== undefined) {
        finalIssueId = issueId;
    }

    let finalDetails = logOptions.details;
    if (typeof finalDetails === 'function') {
        finalDetails = isSuccess ? finalDetails(result as T) : undefined;
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

function getTaskById(db: ReturnType<typeof getDb>, id: string) {
    return db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then(res => res[0] || null);
}

function getRepoByOwnerAndName(db: ReturnType<typeof getDb>, owner: string, repo: string) {
    return db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, repo))).limit(1).then(res => res[0] || null);
}

function getRepoById(db: ReturnType<typeof getDb>, id: string) {
    return db.select().from(repos).where(eq(repos.id, id)).limit(1).then(res => res[0] || null);
}

function getBaseContext(c: Context<any>) {
    return {
        db: getDb(c.env.DB),
        requestId: generateUuid(),
        now: new Date().toISOString()
    };
}

async function getTaskContext(c: Context<any>) {
    const { id } = c.req.param();
    const ctx = getBaseContext(c);
    const task = await getTaskById(ctx.db, id);
    return { id, task, ...ctx };
}

async function getRepoContext(c: Context<any>) {
    const { owner, repo } = c.req.param();
    const ctx = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(ctx.db, owner, repo);
    return { owner, repo, repoRecord, ...ctx };
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
    const { db, repoRecord } = await getRepoContext(c);

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
    const { db } = getBaseContext(c);
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
    const { owner, repo } = c.req.param();
    const body = await c.req.json();
    const { title, description, status, assignee } = body as any;
    const { db, requestId, now } = getBaseContext(c);

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
        (owner, name) => createGitHubIssue(c.env, owner, name, title, description, assignee ? [assignee] : undefined),
        { owner, name: repo },
        {
            requestId,
            taskId: null,
            eventType: 'github_issue_create',
            githubIssueId: (res: any) => res.number,
            details: (res: any) => ({ html_url: res.html_url })
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

    const { startAt, endAt } = calculateTaskTimestamps({}, initialStatus, initialColumn, now);

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
    } catch (e: any) {
        await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', 'failed', { error: e.message });
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    const { id, db, requestId, now, task } = await getTaskContext(c);

    if (!task) {
        return c.json({ success: false, error: 'Task not found' }, 404);
    }

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
    const updatePayload: any = { updatedAt: now };

    if (nextStatus !== currentStatus) {
        updatePayload.status = nextStatus;
        githubUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
    }
    if (nextColumn !== currentColumn) {
        updatePayload.kanbanColumn = nextColumn;
    }

    if (title !== undefined && title !== task.title) {
        updatePayload.title = title;
        if (title) githubUpdates.title = title;
    }
    if (description !== undefined && description !== task.description) {
        updatePayload.description = description;
        if (description) githubUpdates.body = description;
    }
    if (assignee !== undefined && assignee !== task.assignee) {
        updatePayload.assignee = assignee;
        githubUpdates.assignees = assignee ? [assignee] : [];
    }
    if (position !== undefined && position !== task.position) {
        updatePayload.position = position;
    }

    const { startAt, endAt } = calculateTaskTimestamps(task, nextStatus, nextColumn, now);
    if (startAt !== task.startAt) updatePayload.startAt = startAt;
    if (endAt !== task.endAt) updatePayload.endAt = endAt;

    // Sync to GitHub if linked
    const issueId = task.githubIssueId;
    if (issueId && Object.keys(githubUpdates).length > 0) {
        await executeGithubAction(
            db,
            (owner, name, issueNumber) => updateGitHubIssue(c.env, owner, name, issueNumber!, githubUpdates),
            task.repoId,
            { requestId, taskId: id, eventType: 'github_issue_update', details: githubUpdates },
            issueId
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
    const { id, db, requestId, now, task } = await getTaskContext(c);

    if (!task) return c.json({ success: false, error: 'Task not found' }, 404);

    // Sync to GitHub
    const comment = await executeGithubAction(
        db,
        (owner, name, issueNumber) => createGitHubComment(c.env, owner, name, issueNumber!, `**${author || 'User'}**: ${content}`),
        task.repoId,
        { requestId, taskId: id, eventType: 'github_comment_create' },
        task.githubIssueId
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
    const { id, db, requestId, now, task } = await getTaskContext(c);

    if (!task) return c.json({ success: false, error: 'Task not found' }, 404);

    const issueId = task.githubIssueId;
    if (issueId) {
        await executeGithubAction(
            db,
            (owner, name, issueNumber) => updateGitHubIssue(c.env, owner, name, issueNumber!, { state: 'closed' }),
            task.repoId,
            { requestId, taskId: id, eventType: 'github_issue_close' },
            issueId
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
