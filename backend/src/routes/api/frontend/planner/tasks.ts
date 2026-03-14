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

async function getRepoByOwnerAndName(db: any, owner: string, name: string) {
    return db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1).then((res: any) => res[0] || null);
}

async function getRepoById(db: any, id: string) {
    return db.select().from(repos).where(eq(repos.id, id)).limit(1).then((res: any) => res[0] || null);
}

async function getTaskById(db: any, id: string) {
    return db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then((res: any) => res[0] || null);
}

async function getWorkshopTasks(db: any, repoId?: string) {
    const condition = repoId
        ? and(eq(tasks.taskType, 'workshop_project'), eq(tasks.repoId, repoId))
        : eq(tasks.taskType, 'workshop_project');

    const workshopRows = await db.select().from(tasks).where(condition).limit(100);

    return workshopRows.flatMap((w: any) => {
        const phases = Array.isArray(w.taskContext?.phases) ? w.taskContext.phases : [];
        return phases.flatMap((p: any) => {
            const tasksList = Array.isArray(p.tasks) ? p.tasks : [];
            return tasksList.map((t: any) => {
                const status = t.status === 'not_started' ? TaskStatus.TODO :
                               t.status === 'in_progress' ? TaskStatus.IN_PROGRESS : TaskStatus.DONE;

                return {
                    id: `${w.id}-${p.phase_number}-${t.task_number}`,
                    repoId: w.repoId,
                    title: `[Phase ${p.phase_number}] ${t.task_title}`,
                    description: t.task_description || '',
                    status,
                    kanbanColumn: StatusMapper.mapStatusToColumn(status),
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

async function syncWithGitHubIssue(db: any, task: any, callback: (owner: string, name: string, issueNumber: number) => Promise<void>) {
    if (task && task.githubIssueId) {
        const repoRecord = await getRepoById(db, task.repoId);
        if (repoRecord) {
            await callback(repoRecord.owner, repoRecord.name, task.githubIssueId);
        }
    }
}

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

function calculateTaskTimestamps(task: any, status: TaskStatus | undefined, column: KanbanColumn | undefined, now: string) {
    const payload: any = {};
    if ((status === TaskStatus.IN_PROGRESS || column === KanbanColumn.IN_PROGRESS) && (!task || !task.startAt)) {
        payload.startAt = now;
    }
    if (status === TaskStatus.DONE || column === KanbanColumn.DONE) {
        payload.endAt = now;
    } else if (task?.endAt) {
        payload.endAt = null;
    }
    return payload;
}

function initRequest(c: import('hono').Context<{ Bindings: import('@utils/hono').Bindings }>) {
    const db = getDb(c.env.DB);
    const requestId = generateUuid();
    const now = new Date().toISOString();
    return { db, requestId, now };
}

async function getRepoContext(c: import('hono').Context<{ Bindings: import('@utils/hono').Bindings }>) {
    const ctx = initRequest(c);
    const { owner, repo } = c.req.param();
    const repoRecord = await getRepoByOwnerAndName(ctx.db, owner, repo);
    if (!repoRecord) {
        return { ...ctx, owner, repo, error: 'Repo not found', status: 404 as const };
    }
    return { ...ctx, owner, repo, repoRecord };
}

async function getTaskContext(c: import('hono').Context<{ Bindings: import('@utils/hono').Bindings }>) {
    const ctx = initRequest(c);
    const { id } = c.req.param();
    const task = await getTaskById(ctx.db, id);
    if (!task) {
        return { ...ctx, id, error: 'Task not found', status: 404 as const };
    }
    return { ...ctx, id, task };
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
    const { db } = initRequest(c);
    // Join with repos to get context if needed, or just return flat
    const rows = await db.select().from(tasks).where(eq(tasks.isDeleted, 0)).limit(100).orderBy(tasks.updatedAt);
    
    // Also fetch workshop tasks for global view
    const mappedWorkshop = await getWorkshopTasks(db);

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

    // Always log the pending request using base ctx fields
    await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'pending', { owner: ctx.owner, repo: ctx.repo, body });

    if ('error' in ctx) {
        await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'failed', { error: ctx.error });
        return c.json({ success: false, error: ctx.error }, ctx.status);
    }

    const { owner, repo, db, requestId, now, repoRecord } = ctx;

    // 1. Create GitHub Issue
    const issue = await createGitHubIssue(c.env, owner, repo, title, description, assignee ? [assignee] : undefined);

    if (!issue) {
        await logTaskEvent(db, requestId, null, null, 'github_issue_create', 'failed');
        return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500);
    }
    await logTaskEvent(db, requestId, null, issue.number, 'github_issue_create', 'success', { html_url: issue.html_url });

    // 2. Create Local Task
    const newId = generateUuid();

    // Logic: Status defaults to TODO (per schema), Mapper determines column
    const initialStatus = (status as TaskStatus) || TaskStatus.TODO;
    const initialColumn = StatusMapper.mapStatusToColumn(initialStatus);

    const timestamps = calculateTaskTimestamps(null, initialStatus, initialColumn, now);

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
            ...timestamps
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
    const ctx = await getTaskContext(c);
    
    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status);
    const { id, db, requestId, now, task } = ctx;

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

    // Prepare Update Payloads
    const updatePayload: any = { updatedAt: now };
    const ghUpdates: any = {};

    const syncField = <K extends keyof typeof task>(
        localKey: K,
        newValue: any,
        ghKey?: string,
        transform?: (val: any) => any
    ) => {
        if (newValue !== undefined && newValue !== task[localKey]) {
            updatePayload[localKey] = newValue;
            if (ghKey) {
                ghUpdates[ghKey] = transform ? transform(newValue) : newValue;
            }
        }
    };

    syncField('status', nextStatus, 'state', (val) => (val === TaskStatus.DONE ? 'closed' : 'open'));
    syncField('kanbanColumn', nextColumn);
    syncField('position', position);
    syncField('title', title, 'title');
    syncField('description', description, 'body');
    syncField('assignee', assignee, 'assignees', (val) => (val ? [val] : []));

    const { startAt, endAt } = calculateTaskTimestamps(task, nextStatus, nextColumn, now);
    if (startAt !== undefined) updatePayload.startAt = startAt;
    if (endAt !== undefined) updatePayload.endAt = endAt;

    // Sync to GitHub if linked
    if (Object.keys(ghUpdates).length > 0) {
        await syncWithGitHubIssue(db, task, async (owner, name, issueNumber) => {
            const ghResult = await updateGitHubIssue(c.env, owner, name, issueNumber, ghUpdates);
            await logTaskEvent(db, requestId, id, issueNumber, 'github_issue_update', ghResult ? 'success' : 'failed', ghUpdates);
        });
    }

    // Update Local
    if (Object.keys(updatePayload).length > 1) { // >1 because updatedAt is always set
        await db.update(tasks)
            .set(updatePayload)
            .where(eq(tasks.id, id));
    }

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
    let githubCommentId: number | null = null;
    await syncWithGitHubIssue(db, task, async (owner, name, issueNumber) => {
        const comment = await createGitHubComment(c.env, owner, name, issueNumber, `**${author || 'User'}**: ${content}`);
        if (comment) githubCommentId = comment.id;
        await logTaskEvent(db, requestId, id, issueNumber, 'github_comment_create', comment ? 'success' : 'failed');
    });

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

    await syncWithGitHubIssue(db, task, async (owner, name, issueNumber) => {
        await updateGitHubIssue(c.env, owner, name, issueNumber, { state: 'closed' });
        await logTaskEvent(db, requestId, id, issueNumber, 'github_issue_close', 'success');
    });

    await db.update(tasks)
        .set({
            isDeleted: 1,
            updatedAt: now
        })
        .where(eq(tasks.id, id));

    await logTaskEvent(db, requestId, id, task?.githubIssueId || null, 'db_task_soft_delete', 'success');

    return c.json({ success: true });
});

export default tasksApi;
