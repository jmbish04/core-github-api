
import { Hono } from 'hono';
import { Bindings } from "@utils/hono";
import { getDb } from "@db";
import { todos, todoTags, todoTagMap, todoLinks, todoAiInsights } from "@db/schema";
import { eq, and, desc, inArray } from 'drizzle-orm';
import { TodoInsightService } from "@services/todoInsights";
import { generateUuid } from "@/utils/common";

const todosApi = new Hono<{ Bindings: Env }>();

// --- TODOS ---

// GET /api/todos - List all active todos
todosApi.get('/', async (c) => {
    const db = getDb(c.env.DB);
    const allTodos = await db.select().from(todos)
        .where(eq(todos.isDeleted, 0))
        .orderBy(desc(todos.createdAt))
        .limit(100);

    // Fetch tags, links, and insights for these todos
    const todoIds = allTodos.map(t => t.id);
    const tagMap: Record<string, any[]> = {};
    const linkMap: Record<string, any[]> = {};
    const insightMap: Record<string, any[]> = {};

    if (todoIds.length > 0) {
        // Tags
        const tags = await db.select({
            todoId: todoTagMap.todoId,
            tag: todoTags
        })
            .from(todoTagMap)
            .innerJoin(todoTags, eq(todoTagMap.tagId, todoTags.id))
            .where(inArray(todoTagMap.todoId, todoIds));

        tags.forEach(row => {
            if (!tagMap[row.todoId]) tagMap[row.todoId] = [];
            tagMap[row.todoId].push(row.tag);
        });

        // Links
        const links = await db.select().from(todoLinks).where(inArray(todoLinks.todoId, todoIds));
        links.forEach(link => {
            if (!linkMap[link.todoId]) linkMap[link.todoId] = [];
            linkMap[link.todoId].push(link);
        });

        // Insights
        const insights = await db.select().from(todoAiInsights).where(inArray(todoAiInsights.todoId, todoIds));
        insights.forEach(insight => {
            if (!insightMap[insight.todoId]) insightMap[insight.todoId] = [];
            insightMap[insight.todoId].push(insight);
        });
    }

    const result = allTodos.map(todo => ({
        ...todo,
        tags: tagMap[todo.id] || [],
        links: linkMap[todo.id] || [],
        insights: insightMap[todo.id] || []
    }));

    return c.json({ success: true, todos: result });
});

// POST /api/todos - Create a new todo
todosApi.post('/', async (c) => {
    const body = await c.req.json();
    const { title, content, priority, status } = body as any;
    const db = getDb(c.env.DB);
    const id = generateUuid();

    // ... (in POST /)

    await db.insert(todos).values({
        id,
        title: title || 'Untitled',
        content: typeof content === 'object' ? JSON.stringify(content) : content,
        priority: priority || 'normal',
        status: status || 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });

    // Trigger AI processing in background
    c.executionCtx.waitUntil(TodoInsightService.processTodo(c.env, id));

    return c.json({ success: true, id });
});

// PATCH /api/todos/:id - Update todo
todosApi.patch('/:id', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { title, content, status, priority, position } = body as any;
    const db = getDb(c.env.DB);

    const updatePayload: any = {
        updatedAt: new Date().toISOString()
    };

    if (title !== undefined) updatePayload.title = title;
    if (content !== undefined) updatePayload.content = typeof content === 'object' ? JSON.stringify(content) : content;
    if (status !== undefined) {
        updatePayload.status = status;
        if (status === 'done') updatePayload.completedAt = new Date().toISOString();
        else updatePayload.completedAt = null;
    }
    if (priority !== undefined) updatePayload.priority = priority;
    if (position !== undefined) updatePayload.position = position;

    await db.update(todos).set(updatePayload).where(eq(todos.id, id));

    return c.json({ success: true });
});

// DELETE /api/todos/:id - Soft delete
todosApi.delete('/:id', async (c) => {
    const { id } = c.req.param();
    const db = getDb(c.env.DB);

    await db.update(todos).set({ isDeleted: 1, updatedAt: new Date().toISOString() }).where(eq(todos.id, id));
    return c.json({ success: true });
});

// --- TAGS ---

// GET /api/todos/tags - List all tags
todosApi.get('/tags/list', async (c) => {
    const db = getDb(c.env.DB);
    const tags = await db.select().from(todoTags).where(eq(todoTags.isDeleted, 0));
    return c.json({ success: true, tags });
});

// POST /api/todos/tags - Create a tag
todosApi.post('/tags', async (c) => {
    const { name, color, description } = await c.req.json() as any;
    const db = getDb(c.env.DB);

    // Check existing
    const existing = await db.select().from(todoTags).where(eq(todoTags.name, name)).limit(1);
    if (existing.length) return c.json({ success: true, id: existing[0].id }); // Return existing if name match

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-'); // Simple slug
    await db.insert(todoTags).values({
        id,
        name,
        color: color || '#94a3b8',
        description
    });

    return c.json({ success: true, id });
});

// POST /api/todos/:id/tags - Add tag to todo
todosApi.post('/:id/tags', async (c) => {
    const { id } = c.req.param();
    const { tagId } = await c.req.json() as any;
    const db = getDb(c.env.DB);

    // Check availability
    const check = await db.select().from(todoTagMap).where(and(eq(todoTagMap.todoId, id), eq(todoTagMap.tagId, tagId))).limit(1);
    if (check.length) return c.json({ success: true }); // Already mapped

    await db.insert(todoTagMap).values({
        todoId: id,
        tagId
    });

    return c.json({ success: true });
});

// DELETE /api/todos/:id/tags/:tagId - Remove tag from todo
todosApi.delete('/:id/tags/:tagId', async (c) => {
    const { id, tagId } = c.req.param();
    const db = getDb(c.env.DB);

    await db.delete(todoTagMap).where(and(eq(todoTagMap.todoId, id), eq(todoTagMap.tagId, tagId)));
    return c.json({ success: true });
});

export default todosApi;
