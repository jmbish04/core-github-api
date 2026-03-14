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
    actionFn: (owner: string, repoName: string) => Promise<T>,
    logOptions?: {
        requestId: string;
        taskId: string | null;
        eventType: string;
        issueNumber?: number | ((res: T) => number);
        details?: any | ((res: T) => any);
    }
): Promise<T | null> {
    const repoRecord = await getRepoById(db, repoId);
    if (!repoRecord) return null;

    const { owner, name } = repoRecord;

    let result: T | null = null;
    let errorMsg: string | undefined;

    try {
        result = await actionFn(owner, name);
    } catch (e: any) {
        errorMsg = e.message;
    }

    if (logOptions) {
        const status = result && !errorMsg ? 'success' : 'failed';

        // Resolve dynamic issue number
        let actualIssueNumber: number | null = null;
        if (typeof logOptions.issueNumber === 'function') {
            actualIssueNumber = result ? logOptions.issueNumber(result) : null;
        } else if (logOptions.issueNumber !== undefined) {
            actualIssueNumber = logOptions.issueNumber;
        }

        // Resolve dynamic details
        let actualDetails: any = null;
        if (typeof logOptions.details === 'function') {
            actualDetails = result ? logOptions.details(result) : null;
        } else if (logOptions.details !== undefined) {
            actualDetails = logOptions.details;
        }

        const logDetails = errorMsg ? { error: errorMsg, ...actualDetails } : actualDetails;
        await logTaskEvent(db, logOptions.requestId, logOptions.taskId, actualIssueNumber, logOptions.eventType, status, logDetails);
    }

    return result;
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

function getBaseContext(c: Context<{ Bindings: Bindings }>) {
    const db = getDb(c.env.DB);
    const requestId = generateUuid();
    const now = new Date().toISOString();
    return { db, requestId, now };
}

async function getRepoContext(c: Context<{ Bindings: Bindings }>) {
    const { owner, repo } = c.req.param();
    const baseCtx = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(baseCtx.db, owner, repo);

    if (!repoRecord) {
        return { error: 'Repo not found', status: 404 as const, ...baseCtx, repoRecord: null, owner, repo };
    }
    return { error: null, ...baseCtx, repoRecord, owner, repo };
}

async function getTaskContext(c: Context<{ Bindings: Bindings }>) {
    const { id } = c.req.param();
    const baseCtx = getBaseContext(c);
    const task = await getTaskById(baseCtx.db, id);

    if (!task) {
        return { error: 'Task not found', status: 404 as const, ...baseCtx, task: null, id };
    }
    return { error: null, ...baseCtx, task, id };
}

function calculateTaskTimestamps(status: TaskStatus, column: KanbanColumn, currentStartAt: string | null | undefined, currentEndAt: string | null | undefined, now: string) {
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

function mapWorkshopTasks(workshopRows: any[]) {
    return workshopRows.flatMap(w => {
        const context = (w.taskContext || {}) as any;
        const phases = Array.isArray(context?.phases) ? context.phases : [];

        return phases.flatMap((p: any) => {
            const tasksList = Array.isArray(p?.tasks) ? p.tasks : [];

            return tasksList.map((t: any) => {
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
    if ('error' in ctx && ctx.error) return c.json({ success: false, error: ctx.error }, ctx.status);

    const repoRecord = ctx.repoRecord!;

    const rows = await ctx.db.select().from(tasks).where(and(eq(tasks.repoId, repoRecord.id), eq(tasks.isDeleted, 0)));
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
    const ctx = await getRepoContext(c);
    const body = await c.req.json();
    const { title, description, status, assignee } = body as any;

    // Log API Request
    await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'pending', { owner: ctx.owner, repo: ctx.repo, body });

    if ('error' in ctx && ctx.error) {
        await logTaskEvent(ctx.db, ctx.requestId, null, null, 'api_request_create_task', 'failed', { error: ctx.error });
        return c.json({ success: false, error: ctx.error }, ctx.status);
    }

    const repoRecord = ctx.repoRecord!;

    // 1. Create GitHub Issue
    const issue = await performGithubAction(
        ctx.db,
        repoRecord.id,
        (owner, name) => createGitHubIssue(c.env, owner, name, title, description, assignee ? [assignee] : undefined),
        { requestId: ctx.requestId, taskId: null, eventType: 'github_issue_create', issueNumber: (res: any) => res?.number || -1, details: (res: any) => res ? { html_url: res.html_url } : undefined }
    );

    if (!issue) {
        return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500);
    }

    // 2. Create Local Task
    const newId = generateUuid();

    // Logic: Status defaults to TODO (per schema), Mapper determines column
    const initialStatus = (status as TaskStatus) || TaskStatus.TODO;
    const initialColumn = StatusMapper.mapStatusToColumn(initialStatus);

    const { startAt } = calculateTaskTimestamps(initialStatus, initialColumn, undefined, undefined, ctx.now);

    let dbError: string | undefined;

    try {
        await ctx.db.insert(tasks).values({
            id: newId,
            repoId: repoRecord.id,
            title,
            description,
            status: initialStatus,
            kanbanColumn: initialColumn,
            assignee,
            githubIssueId: issue.number,
            githubHtmlUrl: issue.html_url,
            createdAt: ctx.now,
            updatedAt: ctx.now,
            startAt
        });
    } catch (e: any) {
        dbError = e.message;
    }

    await logTaskEvent(ctx.db, ctx.requestId, newId, issue.number, 'db_task_create', dbError ? 'failed' : 'success', dbError ? { error: dbError } : undefined);

    if (dbError) {
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const ctx = await getTaskContext(c);
    if ('error' in ctx && ctx.error) return c.json({ success: false, error: ctx.error }, ctx.status);

    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    const task = ctx.task!;

    await logTaskEvent(ctx.db, ctx.requestId, ctx.id, task.githubIssueId, 'api_request_update_task', 'pending', body);

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
    const updatePayload: any = { updatedAt: ctx.now };
    const githubUpdates: any = {};

    if (nextStatus !== currentStatus) {
        updatePayload.status = nextStatus;
        githubUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
    }
    if (nextColumn !== currentColumn) updatePayload.kanbanColumn = nextColumn;
    if (position !== undefined) updatePayload.position = position;

    const syncField = (
        dbField: string, ghField: string,
        newValue: any, currentValue: any,
        requireTruthForGithub = false,
        ghValueFn?: (v: any) => any
    ) => {
        if (newValue !== undefined && newValue !== currentValue) {
            updatePayload[dbField] = newValue;
            if (!requireTruthForGithub || newValue) {
                githubUpdates[ghField] = ghValueFn ? ghValueFn(newValue) : newValue;
            }
        }
    };

    syncField('title', 'title', title, task.title);
    syncField('description', 'body', description, task.description);
    syncField('assignee', 'assignees', assignee, task.assignee, false, (v) => v ? [v] : []);

    // Sync to GitHub if linked and relevant fields changed
    if (task.githubIssueId && Object.keys(githubUpdates).length > 0) {
        await performGithubAction(
            ctx.db,
            task.repoId,
            (owner, name) => updateGitHubIssue(c.env, owner, name, task.githubIssueId!, githubUpdates),
            { requestId: ctx.requestId, taskId: ctx.id, eventType: 'github_issue_update', issueNumber: task.githubIssueId || undefined, details: githubUpdates }
        );
    }

    const { startAt, endAt } = calculateTaskTimestamps(nextStatus, nextColumn, task.startAt, task.endAt, ctx.now);

    if (startAt !== task.startAt) updatePayload.startAt = startAt;
    if (endAt !== task.endAt) updatePayload.endAt = endAt;

    // Update Local
    await ctx.db.update(tasks)
        .set(updatePayload)
        .where(eq(tasks.id, ctx.id));

    await logTaskEvent(ctx.db, ctx.requestId, ctx.id, task.githubIssueId, 'db_task_update', 'success');

    return c.json({ success: true });
});

// POST /api/tasks/:id/comments
tasksApi.post('/tasks/:id/comments', async (c) => {
    const ctx = await getTaskContext(c);
    if ('error' in ctx && ctx.error) return c.json({ success: false, error: ctx.error }, ctx.status);

    const { content, author } = await c.req.json() as any;
    const task = ctx.task!;

    // Sync to GitHub
    let githubCommentId: number | null = null;
    if (task.githubIssueId) {
        const comment = await performGithubAction(
            ctx.db,
            task.repoId,
            (owner, name) => createGitHubComment(c.env, owner, name, task.githubIssueId!, `**${author || 'User'}**: ${content}`),
            { requestId: ctx.requestId, taskId: ctx.id, eventType: 'github_comment_create', issueNumber: task.githubIssueId || undefined }
        );
        githubCommentId = comment?.id || null;
    }

    // Save Local
    const commentId = generateUuid();
    await ctx.db.insert(taskComments).values({
        id: commentId,
        taskId: ctx.id,
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
    const ctx = await getTaskContext(c);
    if ('error' in ctx && ctx.error) return c.json({ success: false, error: ctx.error }, ctx.status);

    const task = ctx.task!;

    if (task.githubIssueId) {
        await performGithubAction(
            ctx.db,
            task.repoId,
            (owner, name) => updateGitHubIssue(c.env, owner, name, task.githubIssueId!, { state: 'closed' }),
            { requestId: ctx.requestId, taskId: ctx.id, eventType: 'github_issue_close', issueNumber: task.githubIssueId || undefined }
        );
    }

    await ctx.db.update(tasks)
        .set({
            isDeleted: 1,
            updatedAt: ctx.now
        })
        .where(eq(tasks.id, ctx.id));

    await logTaskEvent(ctx.db, ctx.requestId, ctx.id, task.githubIssueId || null, 'db_task_soft_delete', 'success');

    return c.json({ success: true });
});

export default tasksApi;
