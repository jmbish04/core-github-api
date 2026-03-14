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
    actionFn: (owner: string, repoName: string) => Promise<T | null>,
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

    try {
        const result = await actionFn(owner, name);
        if (logOptions) {
            const issueNumber = typeof logOptions.issueNumber === 'function'
                ? (result ? logOptions.issueNumber(result) : undefined)
                : logOptions.issueNumber;

            const details = typeof logOptions.details === 'function'
                ? (result ? logOptions.details(result) : undefined)
                : logOptions.details;

            await logTaskEvent(
                db,
                logOptions.requestId,
                logOptions.taskId,
                issueNumber || null,
                logOptions.eventType,
                result ? 'success' : 'failed',
                details
            );
        }
        return result;
    } catch (e: any) {
        if (logOptions) {
            await logTaskEvent(
                db,
                logOptions.requestId,
                logOptions.taskId,
                typeof logOptions.issueNumber === 'number' ? logOptions.issueNumber : null,
                logOptions.eventType,
                'failed',
                { error: e.message, ...(typeof logOptions.details === 'function' ? {} : logOptions.details) }
            );
        }
        return null;
    }
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

function calculateTaskTimestamps(status: TaskStatus, column: KanbanColumn, currentStartAt: string | null, currentEndAt: string | null, now: string) {
    let startAt = currentStartAt;
    let endAt = currentEndAt;

    const isInProgress = status === TaskStatus.IN_PROGRESS || column === KanbanColumn.IN_PROGRESS;
    const isDone = status === TaskStatus.DONE || column === KanbanColumn.DONE;

    if (isInProgress && !startAt) {
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
    const { owner, repo } = c.req.param();
    const { db } = getBaseContext(c);

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
    const { db } = getBaseContext(c);
    // Join with repos to get context if needed, or just return flat
    const rows = await db.select().from(tasks).where(eq(tasks.isDeleted, 0)).limit(100).orderBy(tasks.updatedAt);
    
    // Also fetch workshop tasks for global view
    const workshopRows = await db.select().from(tasks).where(eq(tasks.taskType, 'workshop_project')).limit(100);
    const mappedWorkshop = workshopRows.flatMap(w => {
        const phases = Array.isArray((w.taskContext as any)?.phases) ? (w.taskContext as any).phases : [];
        return phases.flatMap((p: any) => {
            const phaseTasks = Array.isArray(p.tasks) ? p.tasks : [];
            return phaseTasks.map((t: any) => {
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
    const issue = await performGithubAction(
        db,
        repoRecord.id,
        (owner, name) => createGitHubIssue(c.env, owner, name, title, description, assignee ? [assignee] : undefined),
        {
            requestId,
            taskId: null,
            eventType: 'github_issue_create',
            issueNumber: (res: any) => res.number,
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
            startAt: startAt
        });
    } catch (e: any) {
        await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', 'failed', { error: e.message });
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', 'success');
    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    const { db, requestId, now } = getBaseContext(c);

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

    // Prepare DB and GitHub Update Payloads
    const updatePayload: any = { updatedAt: now };
    const githubUpdates: any = {};

    if (nextStatus !== currentStatus) {
        updatePayload.status = nextStatus;
        githubUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
    }

    if (nextColumn !== currentColumn) {
        updatePayload.kanbanColumn = nextColumn;
    }

    if (position !== undefined && position !== task.position) {
        updatePayload.position = position;
    }

    const syncField = <K extends keyof typeof task>(val: any, field: K, ghField: string, isArray: boolean = false) => {
        if (val !== undefined && val !== task[field]) {
            updatePayload[field] = val;
            githubUpdates[ghField] = isArray ? (val ? [val] : []) : val;
        }
    };

    syncField(title, 'title', 'title');
    syncField(description, 'description', 'body');
    syncField(assignee, 'assignee', 'assignees', true);

    // Sync to GitHub if linked and there are relevant updates
    if (task.githubIssueId && Object.keys(githubUpdates).length > 0) {
        await performGithubAction(
            db,
            task.repoId,
            (owner, name) => updateGitHubIssue(c.env, owner, name, task.githubIssueId!, githubUpdates),
            { requestId, taskId: id, eventType: 'github_issue_update', issueNumber: task.githubIssueId, details: githubUpdates }
        );
    }

    // Logic: Calculate Timestamps
    const { startAt, endAt } = calculateTaskTimestamps(nextStatus, nextColumn, task.startAt, task.endAt, now);

    if (startAt !== task.startAt) updatePayload.startAt = startAt;
    if (endAt !== task.endAt) updatePayload.endAt = endAt;

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
    const { db, requestId, now } = getBaseContext(c);

    const task = await getTaskById(db, id);
    if (!task) return c.json({ success: false, error: 'Task not found' }, 404);

    // Sync to GitHub
    let githubCommentId: number | null = null;
    if (task.githubIssueId) {
        const comment = await performGithubAction(
            db,
            task.repoId,
            (owner, name) => createGitHubComment(c.env, owner, name, task.githubIssueId!, `**${author || 'User'}**: ${content}`),
            { requestId, taskId: id, eventType: 'github_comment_create', issueNumber: task.githubIssueId }
        );
        if (comment) githubCommentId = comment.id;
    }

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
    const { db, requestId, now } = getBaseContext(c);

    const task = await getTaskById(db, id);
    if (!task) return c.json({ success: false, error: 'Task not found' }, 404);

    if (task.githubIssueId) {
        await performGithubAction(
            db,
            task.repoId,
            (owner, name) => updateGitHubIssue(c.env, owner, name, task.githubIssueId!, { state: 'closed' }),
            { requestId, taskId: id, eventType: 'github_issue_close', issueNumber: task.githubIssueId }
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
