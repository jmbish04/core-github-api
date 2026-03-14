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

async function getTaskById(db: ReturnType<typeof getDb>, id: string) {
    return db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then(res => res[0] || null);
}

async function getRepoByOwnerAndName(db: ReturnType<typeof getDb>, owner: string, name: string) {
    return db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1).then(res => res[0] || null);
}

async function getRepoById(db: ReturnType<typeof getDb>, id: string) {
    return db.select().from(repos).where(eq(repos.id, id)).limit(1).then(res => res[0] || null);
}

async function getGitHubContext(db: ReturnType<typeof getDb>, task: any): Promise<{ owner: string, name: string, issueNumber: number } | null> {
    if (!task || !task.githubIssueId || !task.repoId) return null;
    const repoRecord = await getRepoById(db, task.repoId);
    if (!repoRecord) return null;
    return {
        owner: repoRecord.owner,
        name: repoRecord.name,
        issueNumber: task.githubIssueId
    };
}

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

function getBaseContext(c: Context<{ Bindings: Env }>) {
    return {
        db: getDb(c.env.DB),
        requestId: generateUuid(),
        now: new Date().toISOString()
    };
}

async function getRepoContext(c: Context<{ Bindings: Env }>, owner: string, repo: string) {
    const ctx = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(ctx.db, owner, repo);
    if (!repoRecord) return { error: 'Repo not found', status: 404, ...ctx };
    return { repoRecord, ...ctx };
}

async function getTaskContext(c: Context<{ Bindings: Env }>, id: string) {
    const ctx = getBaseContext(c);
    const task = await getTaskById(ctx.db, id);
    if (!task) return { error: 'Task not found', status: 404, ...ctx };
    return { task, ...ctx };
}

function calculateTaskTimestamps(status: TaskStatus, column: KanbanColumn, currentStartAt: string | null, currentEndAt: string | null, now: string) {
    let startAt = currentStartAt;
    let endAt = currentEndAt;

    if ((status === TaskStatus.IN_PROGRESS || column === KanbanColumn.IN_PROGRESS) && !startAt) {
        startAt = now;
    }

    if (status === TaskStatus.DONE || column === KanbanColumn.DONE) {
        endAt = now;
    } else if (endAt) {
        endAt = null;
    }

    return { startAt, endAt };
}

interface LogOptions<T> {
    eventType: string;
    githubIssueId?: number | null | ((res: T) => number | null);
    details?: any;
}

async function executeGithubAction<T>(
    db: ReturnType<typeof getDb>,
    requestId: string,
    taskId: string | null,
    action: () => Promise<T>,
    logOptions?: LogOptions<T>
): Promise<T | null> {
    try {
        const result = await action();
        if (logOptions) {
            const rawIssueNumber = logOptions.githubIssueId;
            const issueNumber = typeof rawIssueNumber === 'function' ? (result ? rawIssueNumber(result) : null) : rawIssueNumber;
            await logTaskEvent(db, requestId, taskId, issueNumber ?? null, logOptions.eventType, result ? 'success' : 'failed', { ...logOptions.details, result });
        }
        return result;
    } catch (e: any) {
        if (logOptions) {
            const rawIssueNumber = logOptions.githubIssueId;
            const issueNumber = typeof rawIssueNumber === 'function' ? null : rawIssueNumber;
            await logTaskEvent(db, requestId, taskId, issueNumber ?? null, logOptions.eventType, 'failed', { error: e.message, ...logOptions.details });
        }
        return null;
    }
}

async function executeTaskGithubAction<T>(
    c: Context<{ Bindings: Env }>,
    db: ReturnType<typeof getDb>,
    requestId: string,
    task: any,
    eventType: string,
    actionFn: (env: Env, owner: string, name: string, issueNumber: number) => Promise<T>,
    details?: any
): Promise<T | null> {
    const ghContext = await getGitHubContext(db, task);
    if (!ghContext) return null;

    const { owner, name, issueNumber } = ghContext;
    return executeGithubAction(
        db,
        requestId,
        task.id,
        () => actionFn(c.env, owner, name, issueNumber),
        {
            eventType,
            githubIssueId: issueNumber,
            details
        }
    );
}

const tasksApi = new Hono<{ Bindings: Env }>();

// GET /api/repos/:owner/:repo/tasks
tasksApi.get('/repos/:owner/:repo/tasks', async (c) => {
    const { owner, repo } = c.req.param();
    const ctx = await getRepoContext(c, owner, repo);

    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status as any);

    const rows = await ctx.db.select().from(tasks).where(and(eq(tasks.repoId, ctx.repoRecord!.id), eq(tasks.isDeleted, 0)));
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
        const phases = Array.isArray(((w.taskContext || {}) as any)?.phases) ? ((w.taskContext || {}) as any).phases : [];

        return phases.flatMap((p: any) => {
            const tasksList = Array.isArray(p?.tasks) ? p.tasks : [];

            return tasksList.map((t: any) => {
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

    const ctx = await getRepoContext(c, owner, repo);
    await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'pending', { owner, repo, body });

    if ('error' in ctx) {
        await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'failed', { error: ctx.error });
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }

    // 1. Create GitHub Issue
    const issue = await executeGithubAction(
        ctx.db, ctx.requestId, null,
        () => createGitHubIssue(c.env, owner, repo, title, description, assignee ? [assignee] : undefined),
        {
            eventType: 'github_issue_create',
            githubIssueId: (res: any) => res?.number || null
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

    const { startAt } = calculateTaskTimestamps(initialStatus, initialColumn, null, null, ctx.now);

    try {
        await ctx.db.insert(tasks).values({
            id: newId,
            repoId: ctx.repoRecord!.id,
            title,
            description,
            status: initialStatus,
            kanbanColumn: initialColumn,
            assignee,
            githubIssueId: issue.number,
            githubHtmlUrl: issue.html_url,
            createdAt: ctx.now,
            updatedAt: ctx.now,
            startAt: startAt
        });
    } catch (e: any) {
        await logTaskEvent(ctx.db, ctx.requestId, newId, issue.number, 'db_task_create', 'failed', { error: e.message });
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    await logTaskEvent(ctx.db, ctx.requestId, newId, issue.number, 'db_task_create', 'success');

    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    const ctx = await getTaskContext(c, id);

    if ('error' in ctx) {
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }

    const task = ctx.task!;
    await logTaskEvent(ctx.db, ctx.requestId, id, task.githubIssueId, 'api_request_update_task', 'pending', body);

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
    const updatePayload: any = {
        updatedAt: ctx.now
    };
    const githubUpdates: any = {};

    const processUpdate = (newValue: any, currentValue: any, assign: () => void) => {
        if (newValue !== undefined && newValue !== currentValue) assign();
    };

    if (nextStatus !== currentStatus) {
        updatePayload.status = nextStatus;
        githubUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
    }
    if (nextColumn !== currentColumn) updatePayload.kanbanColumn = nextColumn;

    if (position !== undefined) updatePayload.position = position;

    processUpdate(title, task.title, () => { updatePayload.title = title; githubUpdates.title = title; });
    processUpdate(description, task.description, () => { updatePayload.description = description; githubUpdates.body = description; });
    processUpdate(assignee, task.assignee, () => { updatePayload.assignee = assignee; githubUpdates.assignees = assignee ? [assignee] : []; });

    const { startAt, endAt } = calculateTaskTimestamps(nextStatus, nextColumn, task.startAt || null, task.endAt || null, ctx.now);
    processUpdate(startAt, task.startAt, () => updatePayload.startAt = startAt);
    processUpdate(endAt, task.endAt, () => updatePayload.endAt = endAt);

    // Sync to GitHub if linked and updates exist
    if (Object.keys(githubUpdates).length > 0) {
        await executeTaskGithubAction(
            c, ctx.db, ctx.requestId, task, 'github_issue_update',
            (env, owner, name, issueNumber) => updateGitHubIssue(env, owner, name, issueNumber, githubUpdates),
            githubUpdates
        );
    }

    // Update Local
    await ctx.db.update(tasks)
        .set(updatePayload)
        .where(eq(tasks.id, id));

    await logTaskEvent(ctx.db, ctx.requestId, id, task.githubIssueId, 'db_task_update', 'success');

    return c.json({ success: true });
});

// POST /api/tasks/:id/comments
tasksApi.post('/tasks/:id/comments', async (c) => {
    const { id } = c.req.param();
    const { content, author } = await c.req.json() as any;
    const ctx = await getTaskContext(c, id);

    if ('error' in ctx) return c.json({ success: false, error: ctx.error }, ctx.status as any);
    const task = ctx.task!;

    // Sync to GitHub
    let githubCommentId: number | null = null;
    const comment = await executeTaskGithubAction(
        c, ctx.db, ctx.requestId, task, 'github_comment_create',
        (env, owner, name, issueNumber) => createGitHubComment(env, owner, name, issueNumber, `**${author || 'User'}**: ${content}`)
    );
    if (comment) {
        githubCommentId = comment.id;
    }

    // Save Local
    const commentId = generateUuid();
    await ctx.db.insert(taskComments).values({
        id: commentId,
        taskId: id,
        content,
        author: author || 'system',
        githubCommentId,
        createdAt: ctx.now,
        updatedAt: ctx.now
    });

    return c.json({ success: true, id: commentId });
});

// DELETE /api/tasks/:id (Soft delete)
tasksApi.delete('/tasks/:id', async (c) => {
    const { id } = c.req.param();
    const ctx = await getTaskContext(c, id);

    // If task not found, just return success since it's already "gone" or we might want to return 404
    // We will mimic the previous logic which only acted if task existed, but if not we still updated tasks where eq
    // Actually, earlier code did: `if (task) { executeGithubAction... } await db.update...`
    // Let's keep it safe. If task doesn't exist, we can just return success or update.
    if (!('error' in ctx)) {
        await executeTaskGithubAction(
            c, ctx.db, ctx.requestId, ctx.task!, 'github_issue_close',
            (env, owner, name, issueNumber) => updateGitHubIssue(env, owner, name, issueNumber, { state: 'closed' })
        );
    }

    await ctx.db.update(tasks)
        .set({
            isDeleted: 1,
            updatedAt: ctx.now
        })
        .where(eq(tasks.id, id));

    if (!('error' in ctx)) {
        await logTaskEvent(ctx.db, ctx.requestId, id, ctx.task!.githubIssueId || null, 'db_task_soft_delete', 'success');
    } else {
        await logTaskEvent(ctx.db, ctx.requestId, id, null, 'db_task_soft_delete', 'success');
    }

    return c.json({ success: true });
});

export default tasksApi;
