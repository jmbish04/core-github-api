/**
 * @file src/routes/api/frontend/planner/todos.ts
 * @description Hono API routes for:
 *   - Corkboard post-it notes  (todos table / /api/todos)
 *   - Corkboard group labels   (corkboard_labels table / /api/todos/labels)
 *   - Todo tags (tag master list + per-todo mapping)
 */

import { Hono } from 'hono';
import { Bindings } from "@utils/hono";
import { getDb } from "@db";
import {
    todos,
    corkboardLabels,
    todoTags,
    todoTagMap,
    todoLinks,
    todoAiInsights,
} from "@db/schema";
import { eq, and, desc, inArray } from 'drizzle-orm';
import { TodoInsightService } from "@services/todoInsights";
import { generateUuid } from "@/utils/common";

const todosApi = new Hono<{ Bindings: Env }>();

// ═══════════════════════════════════════════════════════════════
// CORKBOARD NOTES  (/api/todos)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/todos
 * Returns all active (non-deleted, is_active=1) corkboard post-it notes.
 */
todosApi.get('/', async (c) => {
    const db = getDb(c.env.DB);
    const allTodos = await db.select().from(todos)
        .where(eq(todos.isDeleted, 0))
        .orderBy(desc(todos.createdAt))
        .limit(200);

    const todoIds = allTodos.map(t => t.id);
    let tagMap: Record<string, any[]> = {};
    let linkMap: Record<string, any[]> = {};
    let insightMap: Record<string, any[]> = {};

    if (todoIds.length > 0) {
        const tags = await db.select({ todoId: todoTagMap.todoId, tag: todoTags })
            .from(todoTagMap)
            .innerJoin(todoTags, eq(todoTagMap.tagId, todoTags.id))
            .where(inArray(todoTagMap.todoId, todoIds));

        tagMap = tags.reduce((acc, row) => {
            if (!acc[row.todoId]) acc[row.todoId] = [];
            acc[row.todoId].push(row.tag);
            return acc;
        }, {} as Record<string, any[]>);

        const links = await db.select().from(todoLinks).where(inArray(todoLinks.todoId, todoIds));
        linkMap = links.reduce((acc, link) => {
            if (!acc[link.todoId]) acc[link.todoId] = [];
            acc[link.todoId].push(link);
            return acc;
        }, {} as Record<string, any[]>);

        const insights = await db.select().from(todoAiInsights).where(inArray(todoAiInsights.todoId, todoIds));
        insightMap = insights.reduce((acc, insight) => {
            if (!acc[insight.todoId]) acc[insight.todoId] = [];
            acc[insight.todoId].push(insight);
            return acc;
        }, {} as Record<string, any[]>);
    }

    const result = allTodos.map(todo => ({
        ...todo,
        tags: tagMap[todo.id] || [],
        links: linkMap[todo.id] || [],
        insights: insightMap[todo.id] || [],
    }));

    return c.json({ success: true, todos: result });
});

/**
 * POST /api/todos
 * Create a new corkboard note.
 * Body: { title, content, priority?, posX?, posY?, rotation?, noteColor? }
 */
todosApi.post('/', async (c) => {
    const body = await c.req.json() as any;
    const { title, content, priority, status, posX, posY, rotation, noteColor } = body;
    const db = getDb(c.env.DB);
    const id = generateUuid();
    const now = new Date().toISOString();

    await db.insert(todos).values({
        id,
        title: title || 'Untitled',
        content: typeof content === 'object' ? JSON.stringify(content) : (content ?? ''),
        priority: priority || 'normal',
        status: status || 'pending',
        posX: posX ?? 40,
        posY: posY ?? 40,
        rotation: rotation ?? 0,
        noteColor: noteColor ?? '#fde68a',
        isActive: 1,
        createdAt: now,
        updatedAt: now,
    });

    // Trigger AI processing in background (fire-and-forget)
    c.executionCtx.waitUntil(TodoInsightService.processTodo(c.env, id));

    return c.json({ success: true, id });
});

/**
 * PATCH /api/todos/:id
 * Update any fields of a corkboard note.
 * Supports corkboard position/color updates as well as status changes.
 * Body (all optional): { title, content, status, priority, position, posX, posY, rotation, noteColor, isActive }
 */
todosApi.patch('/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json() as any;
    const db = getDb(c.env.DB);
    const now = new Date().toISOString();

    const patch: Record<string, any> = { updatedAt: now };

    if (body.title     !== undefined) patch.title     = body.title;
    if (body.content   !== undefined) patch.content   = typeof body.content === 'object' ? JSON.stringify(body.content) : body.content;
    if (body.priority  !== undefined) patch.priority  = body.priority;
    if (body.position  !== undefined) patch.position  = body.position;

    // Corkboard layout
    if (body.posX      !== undefined) patch.posX      = body.posX;
    if (body.posY      !== undefined) patch.posY      = body.posY;
    if (body.rotation  !== undefined) patch.rotation  = body.rotation;
    if (body.noteColor !== undefined) patch.noteColor = body.noteColor;

    // Status / completion
    if (body.status !== undefined) {
        patch.status = body.status;
        if (body.status === 'done') {
            patch.completedAt = now;
            patch.isActive = 0;
            patch.dateCompleted = now;
        } else {
            patch.completedAt = null;
            patch.isActive = 1;
            patch.dateCompleted = null;
        }
    }

    // Explicit isActive toggle (e.g. mark done without changing status string)
    if (body.isActive !== undefined) {
        patch.isActive = body.isActive ? 1 : 0;
        if (!body.isActive) {
            patch.dateCompleted = patch.dateCompleted ?? now;
        } else {
            patch.dateCompleted = null;
        }
    }

    await db.update(todos).set(patch).where(eq(todos.id, id));
    return c.json({ success: true });
});

/**
 * DELETE /api/todos/:id — soft delete
 */
todosApi.delete('/:id', async (c) => {
    const { id } = c.req.param();
    const db = getDb(c.env.DB);
    const now = new Date().toISOString();
    await db.update(todos).set({ isDeleted: 1, updatedAt: now }).where(eq(todos.id, id));
    return c.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// CORKBOARD LABELS  (/api/todos/labels)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/todos/labels
 * Returns all active corkboard labels.
 */
todosApi.get('/labels', async (c) => {
    const db = getDb(c.env.DB);
    const labels = await db.select().from(corkboardLabels)
        .where(eq(corkboardLabels.isDeleted, 0))
        .orderBy(corkboardLabels.createdAt);
    return c.json({ success: true, labels });
});

/**
 * POST /api/todos/labels
 * Create a new corkboard label.
 * Body: { text, posX?, posY?, rotation? }
 */
todosApi.post('/labels', async (c) => {
    const body = await c.req.json() as any;
    const db = getDb(c.env.DB);
    const id = generateUuid();
    const now = new Date().toISOString();

    await db.insert(corkboardLabels).values({
        id,
        text: String(body.text ?? '').trim(),
        posX: body.posX ?? 60,
        posY: body.posY ?? 20,
        rotation: body.rotation ?? 0,
        createdAt: now,
        updatedAt: now,
    });

    return c.json({ success: true, id });
});

/**
 * PATCH /api/todos/labels/:id
 * Update label position or text.
 * Body (all optional): { text, posX, posY, rotation }
 */
todosApi.patch('/labels/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json() as any;
    const db = getDb(c.env.DB);
    const now = new Date().toISOString();

    const patch: Record<string, any> = { updatedAt: now };
    if (body.text     !== undefined) patch.text     = String(body.text).trim();
    if (body.posX     !== undefined) patch.posX     = body.posX;
    if (body.posY     !== undefined) patch.posY     = body.posY;
    if (body.rotation !== undefined) patch.rotation = body.rotation;

    await db.update(corkboardLabels).set(patch).where(eq(corkboardLabels.id, id));
    return c.json({ success: true });
});

/**
 * DELETE /api/todos/labels/:id — soft delete
 */
todosApi.delete('/labels/:id', async (c) => {
    const { id } = c.req.param();
    const db = getDb(c.env.DB);
    const now = new Date().toISOString();
    await db.update(corkboardLabels)
        .set({ isDeleted: 1, updatedAt: now })
        .where(eq(corkboardLabels.id, id));
    return c.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// TAGS  (/api/todos/tags)
// ═══════════════════════════════════════════════════════════════

todosApi.get('/tags/list', async (c) => {
    const db = getDb(c.env.DB);
    const tags = await db.select().from(todoTags).where(eq(todoTags.isDeleted, 0));
    return c.json({ success: true, tags });
});

todosApi.post('/tags', async (c) => {
    const { name, color, description } = await c.req.json() as any;
    const db = getDb(c.env.DB);
    const existing = await db.select().from(todoTags).where(eq(todoTags.name, name)).limit(1);
    if (existing.length) return c.json({ success: true, id: existing[0].id });
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    await db.insert(todoTags).values({ id, name, color: color || '#94a3b8', description });
    return c.json({ success: true, id });
});

todosApi.post('/:id/tags', async (c) => {
    const { id } = c.req.param();
    const { tagId } = await c.req.json() as any;
    const db = getDb(c.env.DB);
    const check = await db.select().from(todoTagMap)
        .where(and(eq(todoTagMap.todoId, id), eq(todoTagMap.tagId, tagId))).limit(1);
    if (check.length) return c.json({ success: true });
    await db.insert(todoTagMap).values({ todoId: id, tagId });
    return c.json({ success: true });
});

todosApi.delete('/:id/tags/:tagId', async (c) => {
    const { id, tagId } = c.req.param();
    const db = getDb(c.env.DB);
    await db.delete(todoTagMap).where(and(eq(todoTagMap.todoId, id), eq(todoTagMap.tagId, tagId)));
    return c.json({ success: true });
});

export default todosApi;
