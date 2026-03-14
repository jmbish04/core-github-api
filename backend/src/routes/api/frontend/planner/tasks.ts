// src/routes/api/tasks.ts
import { Hono, Context } from 'hono';
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
 * Execute a GitHub Action if the task is linked to a repository.
 */
async function performGithubAction<T>(
    db: ReturnType<typeof getDb>,
    task: any,
    actionFn: (owner: string, repoName: string, issueNumber: number) => Promise<T>,
    logOptions?: {
        requestId: string;
        eventType: string;
        details?: any;
    }
): Promise<T | null> {
    if (!task.githubIssueId) return null;

    const repoRecord = await getRepoById(db, task.repoId);
    if (!repoRecord) return null;

    const { owner, name } = repoRecord;

    let result: T | null = null;
    let actionError: any = null;

    try {
        result = await actionFn(owner, name, task.githubIssueId);
    } catch (e: any) {
        actionError = e;
    }

    if (logOptions) {
        const status = result && !actionError ? 'success' : 'failed';
        const details = actionError ? { error: actionError.message, ...logOptions.details } : logOptions.details;
        await logTaskEvent(db, logOptions.requestId, task.id, task.githubIssueId, logOptions.eventType, status, details);
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

function getBaseContext(c: Context<{ Bindings: Env }>) {
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

async function getTaskContext(c: Context<{ Bindings: Env }>, id: string) {
    const ctx = getBaseContext(c);
    const task = await getTaskById(ctx.db, id);
    return { ...ctx, task };
}

async function getRepoContext(c: Context<{ Bindings: Env }>, owner: string, repo: string) {
    const ctx = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(ctx.db, owner, repo);
    return { ...ctx, repoRecord };
}

async function updateLocalTask(db: ReturnType<typeof getDb>, task: any, payload: any, requestId: string, eventType: string) {
    let dbError = null;
    try {
        await db.update(tasks)
            .set(payload)
            .where(eq(tasks.id, task.id));
    } catch (e: any) {
        dbError = e;
    }

    await logTaskEvent(db, requestId, task.id, task.githubIssueId, eventType, dbError ? 'failed' : 'success', dbError ? { error: dbError.message } : undefined);

    if (dbError) throw dbError;
}

const tasksApi = new Hono<{ Bindings: Env }>();

// GET /api/repos/:owner/:repo/tasks
tasksApi.get('/repos/:owner/:repo/tasks', async (c) => {
    const { owner, repo } = c.req.param();
    const { db, repoRecord } = await getRepoContext(c, owner, repo);

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
    const db = getDb(c.env.DB);
    // Join with repos to get context if needed, or just return flat
    const rows = await db.select().from(tasks).where(eq(tasks.isDeleted, 0)).limit(100).orderBy(tasks.updatedAt);
    
    // Also fetch workshop tasks for global view
    const workshopRows = await db.select().from(tasks).where(eq(tasks.taskType, 'workshop_project')).limit(100);
    const mappedWorkshop = workshopRows.flatMap(w => {
        const context = (w.taskContext || {}) as any;
        return (Array.isArray(context.phases) ? context.phases : []).flatMap((p: any) => {
            return (Array.isArray(p.tasks) ? p.tasks : []).map((t: any) => {
                const mappedStatus = t.status === 'not_started' ? TaskStatus.TODO : (t.status === 'in_progress' ? TaskStatus.IN_PROGRESS : TaskStatus.DONE);
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

    const { db, requestId, now, repoRecord } = await getRepoContext(c, owner, repo);

    // Log API Request
    await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'pending', { owner, repo, body });

    if (!repoRecord) {
        await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'failed', { error: 'Repo not found' });
        return c.json({ success: false, error: 'Repo not found' }, 404);
    }

    // 1. Create GitHub Issue
    const issue = await createGitHubIssue(c.env, owner, repo, title, description, assignee ? [assignee] : undefined);

    await logTaskEvent(db, requestId, null, issue?.number || null, 'github_issue_create', issue ? 'success' : 'failed', issue ? { html_url: issue.html_url } : undefined);

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
        dbError = e;
    }

    await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', dbError ? 'failed' : 'success', dbError ? { error: dbError.message } : undefined);

    if (dbError) {
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    
    const { db, requestId, now, task } = await getTaskContext(c, id);

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
    // 2. If Status Changed, does Column need to sync? (Priority driven by what was passed)
    // If BOTH passed, Mapper shouldn't override explicit values unless strictly invalid? 
    // Let's assume explicit input wins, but if only one passed, we sync the other.
    else if (status && status !== currentStatus) {
        const syncedColumn = StatusMapper.getSyncColumn(nextColumn, nextStatus);
        if (syncedColumn) nextColumn = syncedColumn;
    }

    // Update Timestamps
    const { startAt, endAt } = calculateTaskTimestamps(nextStatus, nextColumn, now, task.startAt, task.endAt);

    // Prepare DB Update Payload
    const updatePayload: any = { updatedAt: now };
    const githubUpdates: any = {};

    if (status) {
        githubUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
    }

    if (nextStatus !== currentStatus) updatePayload.status = nextStatus;
    if (nextColumn !== currentColumn) updatePayload.kanbanColumn = nextColumn;
    if (startAt !== task.startAt) updatePayload.startAt = startAt;
    if (endAt !== task.endAt) updatePayload.endAt = endAt;
    if (position !== undefined && position !== task.position) updatePayload.position = position;

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

    // Sync to GitHub if linked
    if (task.githubIssueId && Object.keys(githubUpdates).length > 0) {
        await performGithubAction(
            db,
            task,
            (owner, name, issueNumber) => updateGitHubIssue(c.env, owner, name, issueNumber, githubUpdates),
            { requestId, eventType: 'github_issue_update', details: githubUpdates }
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

    const { db, requestId, now, task } = await getTaskContext(c, id);
    if (!task) return c.json({ success: false, error: 'Task not found' }, 404);

    // Sync to GitHub
    const githubComment = await performGithubAction(
        db,
        task,
        (owner, name, issueNumber) => createGitHubComment(c.env, owner, name, issueNumber, `**${author || 'User'}**: ${content}`),
        { requestId, eventType: 'github_comment_create' }
    );

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
    const { id } = c.req.param();

    const { db, requestId, now, task } = await getTaskContext(c, id);
    if (!task) return c.json({ success: false, error: 'Task not found' }, 404);

    await performGithubAction(
        db,
        task,
        (owner, name, issueNumber) => updateGitHubIssue(c.env, owner, name, issueNumber, { state: 'closed' }),
        { requestId, eventType: 'github_issue_close' }
    );

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
