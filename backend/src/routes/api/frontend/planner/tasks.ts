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
    const repoRecord = await db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1);
    return repoRecord.length ? repoRecord[0] : null;
}

async function getRepoById(db: any, id: string) {
    const repoRecord = await db.select().from(repos).where(eq(repos.id, id)).limit(1);
    return repoRecord.length ? repoRecord[0] : null;
}

async function getTaskById(db: any, id: string) {
    const currentTask = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return currentTask.length ? currentTask[0] : null;
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

const tasksApi = new Hono<{ Bindings: Env }>();

// GET /api/repos/:owner/:repo/tasks
tasksApi.get('/repos/:owner/:repo/tasks', async (c) => {
    const { owner, repo } = c.req.param();
    const db = getDb(c.env.DB);

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
    const db = getDb(c.env.DB);
    // Join with repos to get context if needed, or just return flat
    const rows = await db.select().from(tasks).where(eq(tasks.isDeleted, 0)).limit(100).orderBy(tasks.updatedAt);
    
    // Also fetch workshop tasks for global view
    const workshopRows = await db.select().from(tasks).where(eq(tasks.taskType, 'workshop_project')).limit(100);
    const mappedWorkshop: any[] = [];
    workshopRows.forEach(w => {
        if (!((w.taskContext || {}) as any).phases || !Array.isArray(((w.taskContext || {}) as any).phases)) return;
        ((w.taskContext || {}) as any).phases.forEach((p: any) => {
            if (!p.tasks || !Array.isArray(p.tasks)) return;
            p.tasks.forEach((t: any) => {
                mappedWorkshop.push({
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
                });
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
    const db = getDb(c.env.DB);
    const requestId = crypto.randomUUID();

    // Log API Request
    await logTaskEvent(db, requestId, null, null, 'api_request_create_task', 'pending', { owner, repo, body });

    const repoRecord = await getRepoByOwnerAndName(db, owner, repo);
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
    const newId = crypto.randomUUID();

    // Logic: Status defaults to TODO (per schema), Mapper determines column
    const initialStatus = (status as TaskStatus) || TaskStatus.TODO;
    const initialColumn = StatusMapper.mapStatusToColumn(initialStatus);

    let startAt: string | undefined;

    // If initial status implies progress, set startAt
    if (initialStatus === TaskStatus.IN_PROGRESS || initialColumn === KanbanColumn.IN_PROGRESS) {
        startAt = new Date().toISOString();
    }

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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            startAt: startAt
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
    const db = getDb(c.env.DB);
    const requestId = crypto.randomUUID();

    // Get current task
    const task = await getTaskById(db, id);
    
    // Check if it's a workshop task
    if (!task) {
        return c.json({ success: false, error: 'Task not found' }, 404);
    }

    await logTaskEvent(db, requestId, id, task.githubIssueId, 'api_request_update_task', 'pending', body);

    // Determines updates for GitHub
    // ... (GitHub Sync Logic) ...
    // Sync to GitHub if linked
    await syncWithGitHubIssue(db, task, async (owner, name, issueNumber) => {
        const updates: any = {};

        // Map status
        const targetStatus = (status as TaskStatus) || task.status as TaskStatus;

        if (targetStatus === TaskStatus.DONE) updates.state = 'closed';
        else updates.state = 'open';

        if (title) updates.title = title;
        if (description) updates.body = description;
        if (assignee !== undefined) updates.assignees = assignee ? [assignee] : [];

        if (Object.keys(updates).length > 0) {
            const ghResult = await updateGitHubIssue(c.env, owner, name, issueNumber, updates);
            if (ghResult) {
                await logTaskEvent(db, requestId, id, issueNumber, 'github_issue_update', 'success', updates);
            } else {
                await logTaskEvent(db, requestId, id, issueNumber, 'github_issue_update', 'failed', updates);
            }
        }
    });

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
        updatedAt: new Date().toISOString()
    };

    if (nextStatus !== currentStatus) updatePayload.status = nextStatus;
    if (nextColumn !== currentColumn) updatePayload.kanbanColumn = nextColumn;

    if (position !== undefined) updatePayload.position = position;
    if (title !== undefined) updatePayload.title = title;
    if (description !== undefined) updatePayload.description = description;
    if (assignee !== undefined) updatePayload.assignee = assignee;

    // Logic: Set startAt if moving to active state and not set
    if ((nextStatus === TaskStatus.IN_PROGRESS || nextColumn === KanbanColumn.IN_PROGRESS) && !task.startAt) {
        updatePayload.startAt = new Date().toISOString();
    }

    if ((nextStatus as TaskStatus) === TaskStatus.DONE || (nextColumn as KanbanColumn) === KanbanColumn.DONE) {
        updatePayload.endAt = new Date().toISOString();
    } else if (nextStatus !== TaskStatus.DONE && nextColumn !== KanbanColumn.DONE && task.endAt) {
        // If moving OUT of done, reset endAt
        updatePayload.endAt = null;
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
    const { id } = c.req.param();
    const { content, author } = await c.req.json() as any;
    const db = getDb(c.env.DB);
    const requestId = crypto.randomUUID();

    const task = await getTaskById(db, id);
    if (!task) return c.json({ success: false, error: 'Task not found' }, 404);

    // Sync to GitHub
    let githubCommentId: number | null = null;
    await syncWithGitHubIssue(db, task, async (owner, name, issueNumber) => {
        const comment = await createGitHubComment(c.env, owner, name, issueNumber, `**${author || 'User'}**: ${content}`);
        if (comment) {
            githubCommentId = comment.id;
            await logTaskEvent(db, requestId, id, issueNumber, 'github_comment_create', 'success');
        } else {
            await logTaskEvent(db, requestId, id, issueNumber, 'github_comment_create', 'failed');
        }
    });

    // Save Local
    const commentId = crypto.randomUUID();
    await db.insert(taskComments).values({
        id: commentId,
        taskId: id,
        content,
        author: author || 'system',
        githubCommentId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });

    return c.json({ success: true, id: commentId });
});

// DELETE /api/tasks/:id (Soft delete)
tasksApi.delete('/tasks/:id', async (c) => {
    const { id } = c.req.param();
    const db = getDb(c.env.DB);
    const requestId = crypto.randomUUID();

    const task = await getTaskById(db, id);
    await syncWithGitHubIssue(db, task, async (owner, name, issueNumber) => {
        await updateGitHubIssue(c.env, owner, name, issueNumber, { state: 'closed' });
        await logTaskEvent(db, requestId, id, issueNumber, 'github_issue_close', 'success');
    });

    await db.update(tasks)
        .set({
            isDeleted: 1,
            updatedAt: new Date().toISOString()
        })
        .where(eq(tasks.id, id));

    await logTaskEvent(db, requestId, id, task?.githubIssueId || null, 'db_task_soft_delete', 'success');

    return c.json({ success: true });
});

export default tasksApi;
