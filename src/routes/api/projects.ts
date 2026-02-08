
import { Hono } from 'hono';
import { eq, desc, asc } from 'drizzle-orm';
import { getDb } from '../../db';
import { projects, projectPhases } from '../../db/schema-roadmap';
import { tasks } from '../../db/schema-project';
import { createGeminiClient } from '../../lib/gemini';
import { repositories } from '../../db/schema-repos';

const projectsApi = new Hono<{ Bindings: Env }>();

// --- Projects ---

projectsApi.get('/', async (c) => {
    const db = getDb(c.env.DB);
    const result = await db.select({
        // Project fields
        id: projects.id,
        name: projects.name,
        description: projects.description,
        status: projects.status,
        repoId: projects.repoId,
        owner: projects.owner,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        // Repo fields
        repoOwner: repositories.owner,
        repoName: repositories.name,
    })
        .from(projects)
        .leftJoin(repositories, eq(projects.repoId, repositories.id))
        .orderBy(desc(projects.updatedAt));

    return c.json({ success: true, projects: result });
});

projectsApi.post('/', async (c) => {
    const db = getDb(c.env.DB);
    const body = await c.req.json();

    const newProject = {
        id: crypto.randomUUID(),
        repoId: body.repoId,
        name: body.name,
        description: body.description,
        status: 'planning',
        owner: body.owner,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await db.insert(projects).values(newProject);
    return c.json({ success: true, project: newProject });
});

projectsApi.get('/:id', async (c) => {
    const db = getDb(c.env.DB);
    const projectId = c.req.param('id');

    // Fetch Project
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1).then(rows => rows[0]);
    if (!project) return c.json({ success: false, error: 'Project not found' }, 404);

    // Fetch Phases
    const phases = await db.select().from(projectPhases)
        .where(eq(projectPhases.projectId, projectId))
        .orderBy(asc(projectPhases.startDate)); // Chronological

    // Fetch Tasks for this Project (if any are directly linked or via phases)
    // Currently tasks link to phases. We can fetch all tasks for these phases.
    // Or we might want to support tasks linked directly to project if we add projectId to tasks (but user said link to phase).

    return c.json({ success: true, project, phases });
});

projectsApi.delete('/:id', async (c) => {
    const db = getDb(c.env.DB);
    const projectId = c.req.param('id');
    await db.delete(projects).where(eq(projects.id, projectId));
    return c.json({ success: true });
});

// --- Phases ---

projectsApi.post('/:id/phases', async (c) => {
    const db = getDb(c.env.DB);
    const projectId = c.req.param('id');
    const body = await c.req.json();

    const newPhase = {
        id: crypto.randomUUID(),
        projectId: projectId,
        name: body.name,
        description: body.description,
        status: 'pending',
        startDate: body.startDate,
        endDate: body.endDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await db.insert(projectPhases).values(newPhase);
    return c.json({ success: true, phase: newPhase });
});

projectsApi.patch('/phases/:phaseId', async (c) => {
    const db = getDb(c.env.DB);
    const phaseId = c.req.param('phaseId');
    const body = await c.req.json();

    await db.update(projectPhases)
        .set({ ...body, updatedAt: new Date().toISOString() })
        .where(eq(projectPhases.id, phaseId));

    return c.json({ success: true });
});

projectsApi.delete('/phases/:phaseId', async (c) => {
    const db = getDb(c.env.DB);
    const phaseId = c.req.param('phaseId');
    await db.delete(projectPhases).where(eq(projectPhases.id, phaseId));
    return c.json({ success: true });
});

// --- AI Generation ---

projectsApi.post('/phases/:phaseId/generate-instructions', async (c) => {
    const db = getDb(c.env.DB);
    const phaseId = c.req.param('phaseId');

    // 1. Fetch Context
    const phase = await db.select().from(projectPhases).where(eq(projectPhases.id, phaseId)).limit(1).then(r => r[0]);
    if (!phase) return c.json({ error: 'Phase not found' }, 404);

    const project = await db.select().from(projects).where(eq(projects.id, phase.projectId)).limit(1).then(r => r[0]);

    let repoContext = "";
    if (project && project.repoId) {
        const repo = await db.select().from(repositories).where(eq(repositories.id, project.repoId)).limit(1).then(r => r[0]);
        if (repo) {
            repoContext = `
            REPOSITORY: ${repo.name} 
            INFRASTRUCTURE: ${repo.infrastructure}
            DESCRIPTION: ${repo.description}
            `;
        }
    }

    // 2. Generate with Gemini
    const ai = createGeminiClient(c.env);
    const prompt = `
    You are a Technical Lead and Cloudflare Expert.
    Write detailed TECHNICAL INSTRUCTIONS for the following Project Phase.
    
    PROJECT: ${project?.name}
    PHASE: ${phase.name}
    PHASE STATUS: ${phase.status}
    PHASE DESCRIPTION: ${phase.description}
    
    CONTEXT:
    ${repoContext}
    
    Your instructions should be specific, actionable, and tailored to the Cloudflare stack if applicable. 
    Include:
    - Key technical steps to implement this phase.
    - Necessary bindings or configuration changes (wrangler.toml).
    - Pseudocode or API structure if relevant.
    - Verification steps (Success Criteria).
    
    Format the output in Markdown.
    `;

    try {
        const model = c.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
        const result = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });

        const text = (result as any).text || (result as any).response?.text() || "";

        // 3. Save to DB
        await db.update(projectPhases)
            .set({
                technicalInstructions: text,
                updatedAt: new Date().toISOString()
            })
            .where(eq(projectPhases.id, phaseId));

        return c.json({ success: true, instructions: text });

    } catch (e: any) {
        console.error("AI Generation Failed:", e);
        return c.json({ success: false, error: e.message }, 500);
    }
});

export default projectsApi;
