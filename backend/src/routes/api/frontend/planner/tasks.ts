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

async function getRepoByOwnerAndName(db: ReturnType<typeof getDb>, owner: string, name: string) {
    return await db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1).then((res: any) => res[0] || null);
}

async function getRepoById(db: ReturnType<typeof getDb>, id: string) {
    return await db.select().from(repos).where(eq(repos.id, id)).limit(1).then((res: any) => res[0] || null);
}

async function getTaskById(db: ReturnType<typeof getDb>, id: string) {
    return await db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then((res: any) => res[0] || null);
}

async function getWorkshopTasks(db: ReturnType<typeof getDb>, repoId?: string) {
    const condition = repoId
        ? and(eq(tasks.taskType, 'workshop_project'), eq(tasks.repoId, repoId))
        : eq(tasks.taskType, 'workshop_project');

    const workshopRows = await db.select().from(tasks).where(condition).limit(100);

    return workshopRows.flatMap((w: any) => {
        const phases = ((w.taskContext || {}) as any).phases;
        if (!phases || !Array.isArray(phases)) return [];
        return phases.flatMap((p: any) => {
            const tasksList = p.tasks;
            if (!tasksList || !Array.isArray(tasksList)) return [];
            return tasksList.map((t: any) => ({
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
}

async function syncWithGitHubIssue(db: ReturnType<typeof getDb>, task: any, callback: (owner: string, name: string, issueNumber: number) => Promise<void>) {
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
 * Calculates startAt and endAt timestamps based on task status and column changes.
 */
function calculateTaskTimestamps(
    currentStartAt: string | null | undefined,
    currentEndAt: string | null | undefined,
    nextStatus: TaskStatus,
    nextColumn: KanbanColumn,
    now: string
): { startAt?: string | null; endAt?: string | null } {
    const timestamps: { startAt?: string | null; endAt?: string | null } = {};

    // Logic: Set startAt if moving to active state and not set
    if ((nextStatus === TaskStatus.IN_PROGRESS || nextColumn === KanbanColumn.IN_PROGRESS) && !currentStartAt) {
        timestamps.startAt = now;
    }

    if (nextStatus === TaskStatus.DONE || nextColumn === KanbanColumn.DONE) {
        timestamps.endAt = now;
    } else if ((nextStatus as TaskStatus) !== TaskStatus.DONE && (nextColumn as KanbanColumn) !== KanbanColumn.DONE && currentEndAt) {
        // If moving OUT of done, reset endAt
        timestamps.endAt = null;
    }

    return timestamps;
}

const tasksApi = new Hono<{ Bindings: Env }>();

async function executeGithubAction(
    db: ReturnType<typeof getDb>,
    requestId: string,
    taskId: string | null,
    issueNumber: number | null,
    actionName: string,
    actionFn: () => Promise<any>,
    details?: any
) {
    let result = null;
    let errorMsg = null;
    try {
        result = await actionFn();
    } catch (e: any) {
        errorMsg = e.message;
    }

    const finalIssueNumber = actionName === 'github_issue_create' && result ? result.number : issueNumber;
    const finalDetails = errorMsg ? { error: errorMsg, ...details } : (result?.html_url ? { html_url: result.html_url, ...details } : details);

    await logTaskEvent(db, requestId, taskId, finalIssueNumber, actionName, errorMsg || !result ? 'failed' : 'success', finalDetails);

    return result;
}


// Helper to initialize common variables for a request
async function getBaseContext(c: Context<{ Bindings: Env }>, fetchTask: boolean = false, fetchRepo: boolean = false) {
    const { owner, repo, id } = c.req.param();
    const db = getDb(c.env.DB);
    const requestId = generateUuid();
    const now = new Date().toISOString();

    let repoRecord = null;
    if (fetchRepo && owner && repo) {
        repoRecord = await getRepoByOwnerAndName(db, owner, repo);
    }

    let task = null;
    if (fetchTask && id) {
        task = await getTaskById(db, id);
    }

    return { owner, repo, id, db, requestId, now, repoRecord, task };
}


// GET /api/repos/:owner/:repo/tasks
tasksApi.get('/repos/:owner/:repo/tasks', async (c) => {
    const { db, repoRecord } = await getBaseContext(c, false, true);

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
    const { owner, repo, db, requestId, now, repoRecord } = await getBaseContext(c, false, true);

    // Log API Request
    await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'pending', { owner, repo, body });

    if (!repoRecord) {
        await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'failed', { error: 'Repo not found' });
        return c.json({ success: false, error: 'Repo not found' }, 404);
    }

    // 1. Create GitHub Issue
    const issue = await executeGithubAction(db, requestId, null, null, 'github_issue_create',
        () => createGitHubIssue(c.env, owner, repo, title, description, assignee ? [assignee] : undefined)
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

    let dbErrorMsg = null;
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
        dbErrorMsg = e.message;
    }

    await logTaskEvent(db, requestId, newId, issue.number, 'db_task_create', dbErrorMsg ? 'failed' : 'success', dbErrorMsg ? { error: dbErrorMsg } : undefined);

    if (dbErrorMsg) {
        return c.json({ success: false, error: 'Failed to save local task' }, 500);
    }

    return c.json({ success: true, id: newId });
});

// PATCH /api/tasks/:id
tasksApi.patch('/tasks/:id', async (c) => {
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    const { id, db, requestId, now, task } = await getBaseContext(c, true, false);
    
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

    // Construct payloads simultaneously
    const githubUpdates: any = {};
    const updatePayload: any = { updatedAt: now };

    const processUpdate = <K extends keyof typeof task, G extends string>(
        incoming: any,
        taskKey: K,
        payloadKey: string,
        githubKey?: G,
        githubValue?: any
    ) => {
        if (incoming !== undefined && incoming !== task[taskKey]) {
            updatePayload[payloadKey] = incoming;
            if (githubKey) {
                githubUpdates[githubKey] = githubValue !== undefined ? githubValue : incoming;
            }
        }
    };

    processUpdate(nextStatus, 'status', 'status', 'state', nextStatus === TaskStatus.DONE ? 'closed' : 'open');
    processUpdate(nextColumn, 'kanbanColumn', 'kanbanColumn');
    processUpdate(title, 'title', 'title', 'title');
    processUpdate(description, 'description', 'description', 'body');
    processUpdate(assignee, 'assignee', 'assignee', 'assignees', assignee ? [assignee] : []);
    processUpdate(position, 'position', 'position');

    // Sync to GitHub if linked
    await syncWithGitHubIssue(db, task, async (owner, name, issueNumber) => {
        if (Object.keys(githubUpdates).length > 0) {
            await executeGithubAction(db, requestId, id, issueNumber, 'github_issue_update',
                () => updateGitHubIssue(c.env, owner, name, issueNumber, githubUpdates),
                githubUpdates
            );
        }
    });

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
    const { content, author } = await c.req.json() as any;
    const { id, db, requestId, now, task } = await getBaseContext(c, true, false);

    if (!task) return c.json({ success: false, error: 'Task not found' }, 404);

    // Sync to GitHub
    let githubCommentId: number | null = null;
    await syncWithGitHubIssue(db, task, async (owner, name, issueNumber) => {
        const comment = await executeGithubAction(db, requestId, id, issueNumber, 'github_comment_create',
            () => createGitHubComment(c.env, owner, name, issueNumber, `**${author || 'User'}**: ${content}`)
        );
        if (comment) githubCommentId = comment.id;
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
    const { id, db, requestId, now, task } = await getBaseContext(c, true, false);

    await syncWithGitHubIssue(db, task, async (owner, name, issueNumber) => {
        await executeGithubAction(db, requestId, id, issueNumber, 'github_issue_close',
            () => updateGitHubIssue(c.env, owner, name, issueNumber, { state: 'closed' })
        );
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
