// src/routes/api/tasks.ts
import { Hono, Context } from 'hono';
import { Bindings } from '@utils/hono';
import { getDb } from '@db';
import { tasks, repos, taskEvents, taskComments, workshopProjectTasks } from '@db/schema';
import { eq, and } from 'drizzle-orm';
import { createGitHubIssue, updateGitHubIssue, createGitHubComment } from '@/ai/mcp/tools/github/github';

import { TaskStatus, KanbanColumn } from '@/types/project-management/enums';
import { StatusMapper } from '@services/statusMapper';
import { generateUuid } from "@/utils/common";

const getBaseContext = (c: Context<{ Bindings: Env }>) => {
    return {
        db: getDb(c.env.DB),
        requestId: crypto.randomUUID(),
        now: new Date().toISOString()
    };
};

const getRepoByOwnerAndName = async (db: ReturnType<typeof getDb>, owner: string, name: string) => {
    return db.select().from(repos).where(and(eq(repos.owner, owner), eq(repos.name, name))).limit(1).then(res => res[0] || null);
};

const getRepoById = async (db: ReturnType<typeof getDb>, id: string) => {
    return db.select().from(repos).where(eq(repos.id, id)).limit(1).then(res => res[0] || null);
};

const getTaskById = async (db: ReturnType<typeof getDb>, id: string) => {
    return db.select().from(tasks).where(eq(tasks.id, id)).limit(1).then(res => res[0] || null);
};

const executeTaskGithubAction = async <T>(
    c: Context<{ Bindings: Env }>,
    task: { id: string; repoId: string; githubIssueId: number | null },
    actionName: string,
    actionFn: (owner: string, repo: string, issueNumber: number) => Promise<T | null>,
    details?: any
): Promise<T | null> => {
    if (!task.githubIssueId) return null;

    const { db, requestId } = getBaseContext(c);
    const repoRecord = await getRepoById(db, task.repoId);

    if (!repoRecord) return null;

    try {
        const result = await actionFn(repoRecord.owner, repoRecord.name, task.githubIssueId);
        await logTaskEvent(db, requestId, task.id, task.githubIssueId, actionName, result ? 'success' : 'failed', details);
        return result;
    } catch (e: any) {
        await logTaskEvent(db, requestId, task.id, task.githubIssueId, actionName, 'failed', { error: e.message, ...details });
        return null;
    }
};

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
    const workshopRows = await db.select().from(workshopProjectTasks).limit(100);
    const mappedWorkshop: any[] = [];
    workshopRows.forEach(w => {
        if (!w.phases || !Array.isArray(w.phases)) return;
        w.phases.forEach((p: any) => {
            if (!p.tasks || !Array.isArray(p.tasks)) return;
            p.tasks.forEach((t: any) => {
                mappedWorkshop.push({
                    id: `${w.id}-${p.phase_number}-${t.task_number}`,
                    repoId: w.projectId,
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
    const { db, requestId, now } = getBaseContext(c);

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
        startAt = now;
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
            createdAt: now,
            updatedAt: now,
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
    const { db, requestId, now } = getBaseContext(c);

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
    const updates: any = {};
    const targetStatus = (status as TaskStatus) || task.status as TaskStatus;

    if (targetStatus === TaskStatus.DONE) updates.state = 'closed';
    else updates.state = 'open';

    if (title) updates.title = title;
    if (description) updates.body = description;
    if (assignee !== undefined) updates.assignees = assignee ? [assignee] : [];

    if (Object.keys(updates).length > 0) {
        await executeTaskGithubAction(c, task, 'github_issue_update',
            (owner, name, issueNumber) => updateGitHubIssue(c.env, owner, name, issueNumber, updates),
            updates
        );
    }

    // Determine final Status and KanbanColumn using Mapper
    const currentStatus = task.status as TaskStatus;
    const currentColumn = task.kanbanColumn as KanbanColumn;

    let nextStatus = (status as TaskStatus) || currentStatus;
    let nextColumn = (kanbanColumn as KanbanColumn) || currentColumn;

    // Sync status and column
    if (kanbanColumn && kanbanColumn !== currentColumn) {
        nextStatus = StatusMapper.getSyncStatus(nextStatus, nextColumn) || nextStatus;
    } else if (status && status !== currentStatus) {
        nextColumn = StatusMapper.getSyncColumn(nextColumn, nextStatus) || nextColumn;
    }

    // Prepare DB Update Payload
    const updatePayload: any = { updatedAt: now };

    if (nextStatus !== currentStatus) updatePayload.status = nextStatus;
    if (nextColumn !== currentColumn) updatePayload.kanbanColumn = nextColumn;
    if (position !== undefined) updatePayload.position = position;
    if (title !== undefined) updatePayload.title = title;
    if (description !== undefined) updatePayload.description = description;
    if (assignee !== undefined) updatePayload.assignee = assignee;

    // Calculate Timestamps
    const isNextActive = nextStatus === TaskStatus.IN_PROGRESS || nextColumn === KanbanColumn.IN_PROGRESS;
    const isNextDone = nextStatus === TaskStatus.DONE || nextColumn === KanbanColumn.DONE;

    if (isNextActive && !task.startAt) {
        updatePayload.startAt = now;
    }

    if (isNextDone) {
        updatePayload.endAt = now;
    } else if (task.endAt) {
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
    const { db, requestId, now } = getBaseContext(c);

    const task = await getTaskById(db, id);
    if (!task) return c.json({ success: false, error: 'Task not found' }, 404);

    // Sync to GitHub
    let githubCommentId: number | null = null;
    const comment = await executeTaskGithubAction(c, task, 'github_comment_create',
        (owner, name, issueNumber) => createGitHubComment(c.env, owner, name, issueNumber, `**${author || 'User'}**: ${content}`)
    );

    if (comment) {
        githubCommentId = comment.id;
    }

    // Save Local
    const commentId = crypto.randomUUID();
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
        await executeTaskGithubAction(c, task, 'github_issue_close',
            (owner, name, issueNumber) => updateGitHubIssue(c.env, owner, name, issueNumber, { state: 'closed' })
        );
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
