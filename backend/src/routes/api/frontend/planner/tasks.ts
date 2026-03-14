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

async function getTaskById(db: ReturnType<typeof getDb>, id: string) {
    const records = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return records.length ? records[0] : null;
}

async function getRepoByOwnerAndName(db: ReturnType<typeof getDb>, owner: string, name: string) {
    const records = await db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1);
    return records.length ? records[0] : null;
}

async function getRepoById(db: ReturnType<typeof getDb>, id: string) {
    const records = await db.select().from(repos).where(eq(repos.id, id)).limit(1);
    return records.length ? records[0] : null;
}

async function getGitHubContext(db: ReturnType<typeof getDb>, repoId: string, githubIssueId: number | null) {
    if (!githubIssueId) return null;
    const repoRecord = await getRepoById(db, repoId);
    if (!repoRecord) return null;
    return { owner: repoRecord.owner, name: repoRecord.name, issueNumber: githubIssueId };
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

/**
 * Execute a GitHub action and log the result
 */
async function executeGithubAction<T>(
    db: ReturnType<typeof getDb>,
    requestId: string,
    taskId: string | null,
    issueNumber: number | null | ((result: T) => number | null),
    eventType: string,
    action: () => Promise<T | null>,
    detailsOnSuccess?: any | ((result: T) => any),
    detailsOnFail?: any
): Promise<T | null> {
    const result = await action();
    if (result) {
        const resolvedIssueNumber = typeof issueNumber === 'function' ? issueNumber(result) : issueNumber;
        const resolvedDetails = typeof detailsOnSuccess === 'function' ? detailsOnSuccess(result) : detailsOnSuccess;
        await logTaskEvent(db, requestId, taskId, resolvedIssueNumber, eventType, 'success', resolvedDetails);
    } else {
        const failedIssueNumber = typeof issueNumber === 'function' ? null : issueNumber;
        await logTaskEvent(db, requestId, taskId, failedIssueNumber, eventType, 'failed', detailsOnFail);
    }
    return result;
}

/**
 * Calculate timestamps based on status/column changes
 */
function calculateTaskTimestamps(
    currentStartAt: string | null,
    currentEndAt: string | null,
    nextStatus: TaskStatus,
    nextColumn: KanbanColumn,
    now: string
): { startAt?: string; endAt?: string | null } {
    const updates: { startAt?: string; endAt?: string | null } = {};

    // Set startAt if moving to active state and not set
    if ((nextStatus === TaskStatus.IN_PROGRESS || nextColumn === KanbanColumn.IN_PROGRESS) && !currentStartAt) {
        updates.startAt = now;
    }

    if (nextStatus === TaskStatus.DONE || nextColumn === KanbanColumn.DONE) {
        updates.endAt = now;
    } else if (currentEndAt) {
        // If moving OUT of done, reset endAt
        updates.endAt = null;
    }

    return updates;
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
        const phases = ((w.taskContext || {}) as any).phases;
        if (!phases || !Array.isArray(phases)) return [];

        return phases.flatMap((p: any) => {
            if (!p.tasks || !Array.isArray(p.tasks)) return [];

            return p.tasks.map((t: any) => ({
                id: `${w.id}-${p.phase_number}-${t.task_number}`,
                repoId: w.repoId,
                title: `[Phase ${p.phase_number}] ${t.task_title}`,
                description: t.task_description || '',
                status: t.status === 'not_started' ? TaskStatus.TODO :
                        t.status === 'in_progress' ? TaskStatus.IN_PROGRESS : TaskStatus.DONE,
                kanbanColumn: t.status === 'not_started' ? KanbanColumn.PLANNED :
                              t.status === 'in_progress' ? KanbanColumn.IN_PROGRESS : KanbanColumn.DONE,
                assignee: t.agent_assigned || null,
                githubIssueId: null,
                githubHtmlUrl: null,
                createdAt: w.createdAt,
                updatedAt: w.updatedAt,
                startAt: null,
                endAt: null,
                isDeleted: 0
            }));
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
        requestId,
        null,
        (result: any) => result.number,
        'github_issue_create',
        () => createGitHubIssue(c.env, owner, repo, title, description, assignee ? [assignee] : undefined),
        (result: any) => ({ html_url: result.html_url })
    );

    if (!issue) {
        return c.json({ success: false, error: 'Failed to create GitHub issue' }, 500);
    }

    // 2. Create Local Task
    const newId = generateUuid();

    // Logic: Status defaults to TODO (per schema), Mapper determines column
    const initialStatus = (status as TaskStatus) || TaskStatus.TODO;
    const initialColumn = StatusMapper.mapStatusToColumn(initialStatus);

    const { startAt, endAt } = calculateTaskTimestamps(null, null, initialStatus, initialColumn, now);

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

    if (nextStatus !== currentStatus) {
        updatePayload.status = nextStatus;
        ghUpdates.state = nextStatus === TaskStatus.DONE ? 'closed' : 'open';
    }
    if (nextColumn !== currentColumn) {
        updatePayload.kanbanColumn = nextColumn;
    }

    if (position !== undefined && position !== task.position) updatePayload.position = position;
    if (title !== undefined && title !== task.title) {
        updatePayload.title = title;
        ghUpdates.title = title;
    }
    if (description !== undefined && description !== task.description) {
        updatePayload.description = description;
        ghUpdates.body = description;
    }
    if (assignee !== undefined && assignee !== task.assignee) {
        updatePayload.assignee = assignee;
        ghUpdates.assignees = assignee ? [assignee] : [];
    }

    // Sync to GitHub if linked and there are changes
    if (Object.keys(ghUpdates).length > 0) {
        const githubContext = await getGitHubContext(db, task.repoId, task.githubIssueId);
        if (githubContext) {
            const { owner, name, issueNumber } = githubContext;
            await executeGithubAction(
                db,
                requestId,
                id,
                issueNumber,
                'github_issue_update',
                () => updateGitHubIssue(c.env, owner, name, issueNumber, ghUpdates),
                ghUpdates,
                ghUpdates
            );
        }
    }

    // Logic: Timestamps
    const { startAt, endAt } = calculateTaskTimestamps(task.startAt, task.endAt, nextStatus, nextColumn, now);
    if (startAt !== undefined) updatePayload.startAt = startAt;
    if (endAt !== undefined) updatePayload.endAt = endAt;

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
    const githubContext = await getGitHubContext(db, task.repoId, task.githubIssueId);
    if (githubContext) {
        const { owner, name, issueNumber } = githubContext;
        const comment = await executeGithubAction(
            db,
            requestId,
            id,
            issueNumber,
            'github_comment_create',
            () => createGitHubComment(c.env, owner, name, issueNumber, `**${author || 'User'}**: ${content}`)
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
    if (task) {
        const githubContext = await getGitHubContext(db, task.repoId, task.githubIssueId);
        if (githubContext) {
            const { owner, name, issueNumber } = githubContext;
            await executeGithubAction(
                db,
                requestId,
                id,
                issueNumber,
                'github_issue_close',
                () => updateGitHubIssue(c.env, owner, name, issueNumber, { state: 'closed' })
            );
        }
    }

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
