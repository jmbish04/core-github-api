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
 * Execute a GitHub Action if the task is linked to a repository.
 */
async function performGithubAction(
    db: any,
    task: any,
    actionFn: (owner: string, repoName: string, issueNumber: number) => Promise<any>,
    logOptions?: {
        requestId: string;
        eventType: string;
        details?: any;
    }
) {
    if (!task.githubIssueId) return null;

    const repoRecord = await db.select().from(repos).where(eq(repos.id, task.repoId)).limit(1);
    if (!repoRecord.length) return null;

    const { owner, name } = repoRecord[0];

    try {
        const result = await actionFn(owner, name, task.githubIssueId);
        if (logOptions) {
            await logTaskEvent(db, logOptions.requestId, task.id, task.githubIssueId, logOptions.eventType, result ? 'success' : 'failed', logOptions.details);
        }
        return result;
    } catch (e: any) {
        if (logOptions) {
            await logTaskEvent(db, logOptions.requestId, task.id, task.githubIssueId, logOptions.eventType, 'failed', { error: e.message, ...logOptions.details });
        }
        return null;
    }
}

async function getRepoByOwnerAndName(db: any, owner: string, name: string) {
    return await db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1);
}

async function getTaskById(db: any, id: string) {
    return await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
}

function getBaseContext(c: any) {
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
    } else if ((status as TaskStatus) !== TaskStatus.DONE && (column as KanbanColumn) !== KanbanColumn.DONE && endAt) {
        endAt = null; // Reset if moving out of done
    }

    return { startAt, endAt };
}

async function getTaskContext(c: any, id: string) {
    const { db, requestId, now } = getBaseContext(c);
    const currentTask = await getTaskById(db, id);
    return { db, requestId, now, task: currentTask.length ? currentTask[0] : null };
}

async function getRepoContext(c: any, owner: string, repo: string) {
    const { db, requestId, now } = getBaseContext(c);
    const repoRecord = await getRepoByOwnerAndName(db, owner, repo);
    return { db, requestId, now, repoRecord: repoRecord.length ? repoRecord[0] : null };
}

async function updateLocalTask(db: any, task: any, payload: any, requestId: string, eventType: string) {
    await db.update(tasks)
        .set(payload)
        .where(eq(tasks.id, task.id));
    await logTaskEvent(db, requestId, task.id, task.githubIssueId, eventType, 'success');
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

    const { db, requestId, now, repoRecord } = await getRepoContext(c, owner, repo);

    // Log API Request
    await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'pending', { owner, repo, body });

    if (!repoRecord) {
        await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'failed', { error: 'Repo not found' });
        return c.json({ success: false, error: 'Repo not found' }, 404);
    }

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

    const { startAt, endAt } = calculateTaskTimestamps(initialStatus, initialColumn, now);

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
    const { id } = c.req.param();
    const body = await c.req.json();
    const { status, position, title, description, assignee, kanbanColumn } = body as any;
    
    const { db, requestId, now, task } = await getTaskContext(c, id);

    if (!task) {
        return c.json({ success: false, error: 'Task not found' }, 404);
    }

    await logTaskEvent(db, requestId, id, task.githubIssueId, 'api_request_update_task', 'pending', body);

    // Determines updates for GitHub
    // Sync to GitHub if linked
    if (task.githubIssueId) {
        const updates: any = {};
        const targetStatus = (status as TaskStatus) || task.status as TaskStatus;

        if (targetStatus === TaskStatus.DONE) updates.state = 'closed';
        else updates.state = 'open';

        if (title) updates.title = title;
        if (description) updates.body = description;
        if (assignee !== undefined) updates.assignees = assignee ? [assignee] : [];

        if (Object.keys(updates).length > 0) {
            await performGithubAction(
                db,
                task,
                async (owner, name, issueNumber) => await updateGitHubIssue(c.env, owner, name, issueNumber, updates),
                { requestId, eventType: 'github_issue_update', details: updates }
            );
        }
    }

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

    // Prepare DB Update Payload
    const updatePayload: any = {
        updatedAt: now
    };

    if (nextStatus !== currentStatus) updatePayload.status = nextStatus;
    if (nextColumn !== currentColumn) updatePayload.kanbanColumn = nextColumn;

    if (position !== undefined) updatePayload.position = position;
    if (title !== undefined) updatePayload.title = title;
    if (description !== undefined) updatePayload.description = description;
    if (assignee !== undefined) updatePayload.assignee = assignee;

    // Update Timestamps
    const { startAt, endAt } = calculateTaskTimestamps(nextStatus, nextColumn, now, task.startAt, task.endAt);
    if (startAt !== task.startAt) updatePayload.startAt = startAt;
    if (endAt !== task.endAt) updatePayload.endAt = endAt;

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
    let githubCommentId: number | null = null;
    await performGithubAction(
        db,
        task,
        async (owner, name, issueNumber) => {
            const comment = await createGitHubComment(c.env, owner, name, issueNumber, `**${author || 'User'}**: ${content}`);
            if (comment) githubCommentId = comment.id;
            return comment;
        },
        { requestId, eventType: 'github_comment_create' }
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

    const { db, requestId, now, task } = await getTaskContext(c, id);
    if (!task) return c.json({ success: false, error: 'Task not found' }, 404);

    await performGithubAction(
        db,
        task,
        async (owner, name, issueNumber) => await updateGitHubIssue(c.env, owner, name, issueNumber, { state: 'closed' }),
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
