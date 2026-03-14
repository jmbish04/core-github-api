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
    repoInfo: string | any, // repoId or repoRecord
    githubIssueId: number | null | undefined, // undefined to bypass null check
    actionFn: (owner: string, repoName: string) => Promise<T | null>,
    logOptions?: {
        requestId: string;
        taskId: string | null;
        eventType: string;
        issueNumber?: number | ((res: T) => number);
        details?: any | ((res: T) => any);
    }
): Promise<T | null> {
    if (githubIssueId === null) return null;

    let repoRecord;
    if (typeof repoInfo === 'string') {
        repoRecord = await getRepoById(db, repoInfo);
    } else {
        repoRecord = repoInfo;
    }

    if (!repoRecord) return null;

    const { owner, name } = repoRecord;

    let result: T | null = null;
    let actionError = null;
    let isSuccess = false;

    try {
        result = await actionFn(owner, name);
        isSuccess = !!result;
    } catch (e: any) {
        actionError = e.message;
    }

    if (logOptions) {
        let evaluatedDetails = logOptions.details;
        if (typeof logOptions.details === 'function' && result) {
            evaluatedDetails = logOptions.details(result);
        }
        const details = actionError ? { error: actionError, ...evaluatedDetails } : evaluatedDetails;
        let issueIdToLog: number | null = githubIssueId || null;

        if (logOptions.issueNumber !== undefined) {
            if (typeof logOptions.issueNumber === 'function' && result) {
                issueIdToLog = logOptions.issueNumber(result);
            } else if (typeof logOptions.issueNumber === 'number') {
                issueIdToLog = logOptions.issueNumber;
            }
        }

        await logTaskEvent(
            db,
            logOptions.requestId,
            logOptions.taskId,
            issueIdToLog,
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

async function getTaskContext(c: Context<{ Bindings: Bindings }>) {
    const { id } = c.req.param();
    const base = getBaseContext(c);
    const task = await getTaskById(base.db, id);

    if (!task) {
        return { error: 'Task not found', status: 404 };
    }

    return { ...base, id, task };
}

async function getRepoContext(c: Context<{ Bindings: Bindings }>) {
    const { owner, repo } = c.req.param();
    const base = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(base.db, owner, repo);

    if (!repoRecord) {
        return { error: 'Repo not found', status: 404 };
    }

    return { ...base, owner, repo, repoRecord };
}

function calculateTaskTimestamps(task: any, nextStatus: TaskStatus, nextColumn: KanbanColumn, now: string) {
    let startAt = task.startAt;
    let endAt = task.endAt;

    if ((nextStatus === TaskStatus.IN_PROGRESS || nextColumn === KanbanColumn.IN_PROGRESS) && !startAt) {
        startAt = now;
    }

    if (nextStatus === TaskStatus.DONE || nextColumn === KanbanColumn.DONE) {
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
    if ('error' in ctx) {
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }
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
    const ctx = await getRepoContext(c);
    if ('error' in ctx) {
        // Technically repo-not-found log might be skipped here to stay DRY, but original logged it.
        // We will log the API request missing early, or just rely on the 404. Let's log it to maintain exact operational behavior.
        const { owner, repo } = c.req.param();
        const base = getBaseContext(c);
        await logTaskEvent(base.db, base.requestId, null, null, 'api_request_create_task', 'failed', { error: ctx.error });
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }
    const { db, requestId, now, owner, repo, repoRecord } = ctx;

    const body = await c.req.json();
    const { title, description, status, assignee } = body as any;

    // Log API Request
    await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'pending', { owner, repo, body });

    // 1. Create GitHub Issue
    const issue = await performGithubAction(
        db,
        repoRecord,
        undefined, // creation, no issue ID yet, bypasses null check
        async (o, n) => await createGitHubIssue(c.env, o, n, title, description, assignee ? [assignee] : undefined),
        { requestId, taskId: null, eventType: 'github_issue_create', issueNumber: (res: any) => res.number, details: (res: any) => ({ html_url: res.html_url }) }
    );

    if (!issue) {
        return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500);
    }

    // 2. Create Local Task
    const newId = generateUuid();

    // Logic: Status defaults to TODO (per schema), Mapper determines column
    const initialStatus = (status as TaskStatus) || TaskStatus.TODO;
    const initialColumn = StatusMapper.mapStatusToColumn(initialStatus);

    let startAt: string | undefined;


    // If initial status implies progress, set startAt
    if (initialStatus === TaskStatus.IN_PROGRESS || initialColumn === KanbanColumn.IN_PROGRESS) {
        startAt = now;
    }

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
            startAt: startAt
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
        !dbError ? 'success' : 'failed',
        dbError ? { error: dbError } : undefined
    );

    if (dbError) {
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const ctx = await getTaskContext(c);
    if ('error' in ctx) {
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }
    const { db, requestId, now, id, task } = ctx;

    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;

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

    const syncField = <K extends keyof typeof updatePayload, G extends keyof typeof githubUpdates>(
        localValue: any,
        localKey: K,
        currentValue: any,
        githubKey?: G,
        githubTransform?: (val: any) => any
    ) => {
        if (localValue !== undefined && localValue !== currentValue) {
            updatePayload[localKey] = localValue;
            if (githubKey && localValue !== null && localValue !== '') {
                githubUpdates[githubKey] = githubTransform ? githubTransform(localValue) : localValue;
            } else if (githubKey && (localValue === null || localValue === '')) {
                // To keep parity with current logic, if falsy we still run the transform or ignore?
                // Wait, previous code checked `if (title) githubUpdates.title = title;`
                // Let's replicate exact behavior
                if (githubTransform) {
                     githubUpdates[githubKey] = githubTransform(localValue);
                }
            }
        }
    };

    syncField(nextStatus, 'status', currentStatus, 'state', (val) => val === TaskStatus.DONE ? 'closed' : 'open');
    syncField(nextColumn, 'kanbanColumn', currentColumn);

    syncField(title, 'title', task.title, 'title');
    syncField(description, 'description', task.description, 'body');
    syncField(assignee, 'assignee', task.assignee, 'assignees', (val) => val ? [val] : []);
    syncField(position, 'position', task.position);

    const { startAt, endAt } = calculateTaskTimestamps(task, nextStatus, nextColumn, now);
    syncField(startAt, 'startAt', task.startAt);
    syncField(endAt, 'endAt', task.endAt);

    // Sync to GitHub if linked
    if (task.githubIssueId && Object.keys(githubUpdates).length > 0) {
        await performGithubAction(
            db,
            task.repoId,
            task.githubIssueId,
            (owner, name) => updateGitHubIssue(c.env, owner, name, task.githubIssueId!, githubUpdates),
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
    const ctx = await getTaskContext(c);
    if ('error' in ctx) {
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }
    const { db, requestId, now, id, task } = ctx;

    const { content, author } = await c.req.json() as any;

    // Sync to GitHub
    const commentResult = await performGithubAction(
        db,
        task.repoId,
        task.githubIssueId,
        (owner, name) => createGitHubComment(c.env, owner, name, task.githubIssueId!, `**${author || 'User'}**: ${content}`),
        { requestId, taskId: id, eventType: 'github_comment_create' }
    );
    const githubCommentId = commentResult ? commentResult.id : null;

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
    if ('error' in ctx) {
        return c.json({ success: false, error: ctx.error }, ctx.status as any);
    }
    const { db, requestId, now, id, task } = ctx;

    if (task.githubIssueId) {
        await performGithubAction(
            db,
            task.repoId,
            task.githubIssueId,
            (owner, name) => updateGitHubIssue(c.env, owner, name, task.githubIssueId!, { state: 'closed' }),
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
