import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getDb, workshopProjects, workshopTaskEvents, workshopProjectTasks, workshopAgentMemory } from "@db";
import { eq, sql } from 'drizzle-orm';
import { getAgentByName } from 'agents';

// Helper for generating UUIDs
const generateUuid = () => crypto.randomUUID();

const app = new OpenAPIHono<{ Bindings: Env }>();

// 1. POST /draft
const draftRoute = createRoute({
    operationId: 'postDraft',
    method: 'post',
    path: '/draft',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        projectId: z.string().optional(),
                        name: z.string(),
                        draftData: z.any()
                    })
                }
            }
        }
    },
    responses: {
        200: {
            description: 'Draft saved',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), projectId: z.string() }) } }
        }
    }
});

app.openapi(draftRoute, async (c) => {
    const db = getDb(c.env.DB);
    const body = c.req.valid('json');
    const projectId = body.projectId || generateUuid();

    await db.insert(workshopProjects).values({
        id: projectId,
        name: body.name,
        draftData: body.draftData,
        status: 'draft'
    }).onConflictDoUpdate({
        target: workshopProjects.id,
        set: {
            name: body.name,
            draftData: body.draftData,
            status: 'draft'
        }
    });

    return c.json({ success: true, projectId }, 200);
});

// 2. POST /init
const initRoute = createRoute({
    operationId: 'postInit',
    method: 'post',
    path: '/init',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        projectId: z.string(),
                        owner: z.string().optional(),
                        description: z.string().optional(),
                        visibility: z.enum(["public", "private"]).default("private")
                    })
                }
            }
        }
    },
    responses: {
        200: {
            description: 'Project initialized',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), repoUrl: z.string().optional() }) } }
        },
        404: {
            description: 'Project not found',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), error: z.string() }) } }
        }
    }
});

app.openapi(initRoute, async (c) => {
    const db = getDb(c.env.DB);
    const body = c.req.valid('json');
    
    // Get project
    const proj = await db.select().from(workshopProjects).where(eq(workshopProjects.id, body.projectId)).limit(1);
    if (!proj || proj.length === 0) return c.json({ success: false, error: 'Project not found' }, 404);

    // Create GitHub Repo via WorkshopAgent
    let repoUrl = "";
    try {
        const agent = await getAgentByName(c.env.WORKSHOP_AGENT as any, body.projectId) as any;
        const result = await agent.initializeRepository(body.projectId, { 
            owner: body.owner, 
            description: body.description, 
            visibility: body.visibility 
        });
        
        if (result.success) {
            repoUrl = result.repoUrl;
        } else {
             console.error("Agent failed to initialize repository", result);
        }
    } catch(e: any) {
        console.error("Failed to call agent for repo creation", e);
    }

    // Log Event
    await db.insert(workshopTaskEvents).values({
        id: generateUuid(),
        projectId: body.projectId,
        type: 'system',
        actor: 'user',
        content: { action: 'Project initialized', repoUrl }
    });

    return c.json({ success: true, repoUrl }, 200);
});

// 3. POST /project/:id/tasks
const pushTasksRoute = createRoute({
    operationId: 'postProjectIdTasks',
    method: 'post',
    path: '/project/{id}/tasks',
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        tasks: z.array(z.object({
                            phaseNumber: z.number(),
                            phaseTitle: z.string(),
                            taskNumber: z.number(),
                            taskTitle: z.string(),
                            taskDescription: z.string().optional(),
                            agentAssigned: z.string().optional(),
                            requirements: z.array(z.string()).optional()
                        }))
                    })
                }
            }
        }
    },
    responses: {
        200: {
            description: 'Tasks saved',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
        }
    }
});

app.openapi(pushTasksRoute, async (c) => {
    const db = getDb(c.env.DB);
    const { id } = c.req.valid('param');
    const { tasks } = c.req.valid('json');

    const groupedPhases: any[] = [];
    tasks.forEach((t: any) => {
        let phase = groupedPhases.find((p) => p.phase_number === t.phaseNumber);
        if (!phase) {
            phase = {
                phase_number: t.phaseNumber,
                phase_title: t.phaseTitle,
                description: '',
                success_criteria: [],
                implementation_plan: { title: '', description: '', architecture: { explanation: '', mermaid_diagram: '' }, proposed_changes: [], verification_plan: { automated_tests: [], manual_verification: [] } },
                tasks: []
            };
            groupedPhases.push(phase);
        }
        phase.tasks.push({
            task_number: t.taskNumber,
            status: 'not_started',
            agent_assigned: t.agentAssigned,
            task_title: t.taskTitle,
            task_description: t.taskDescription || '',
            task_dependencies: [],
            cloudflare_docs_queries: [],
            steps: [],
            requirements: t.requirements || [],
            success_criteria: []
        });
    });

    const existingProject = await db.select().from(workshopProjectTasks).where(eq(workshopProjectTasks.projectId, id)).limit(1);

    if (existingProject.length > 0) {
        await db.update(workshopProjectTasks)
            .set({ phases: [...existingProject[0].phases, ...groupedPhases] })
            .where(eq(workshopProjectTasks.projectId, id));
    } else {
        await db.insert(workshopProjectTasks).values({
            id: generateUuid(),
            projectId: id,
            projectName: `Project ${id}`,
            generatedDate: new Date().toISOString(),
            totalPhases: groupedPhases.length,
            phases: groupedPhases
        });
    }

    // Log Event
    if (tasks.length > 0) {
        await db.insert(workshopTaskEvents).values({
            id: generateUuid(),
            projectId: id,
            type: 'system',
            actor: 'orchestrator',
            content: { action: `Pushed ${tasks.length} tasks` }
        });
    }

    return c.json({ success: true }, 200);
});

// 4. GET /project/:id/events
const getEventsRoute = createRoute({
    operationId: 'getProjectIdEvents',
    method: 'get',
    path: '/project/{id}/events',
    request: {
        params: z.object({ id: z.string() })
    },
    responses: {
        200: {
            description: 'List of project events',
            content: {
                'application/json': {
                    schema: z.object({
                        events: z.array(z.object({
                            id: z.string(),
                            projectId: z.string(),
                            type: z.string(),
                            actor: z.string(),
                            content: z.any(),
                            createdAt: z.string()
                        }))
                    })
                }
            }
        }
    }
});

app.openapi(getEventsRoute, async (c) => {
    const db = getDb(c.env.DB);
    const { id } = c.req.valid('param');
    
    // Fetch events ascending, coerce nullable fields for Zod schema compatibility
    const rawEvents = await db.select().from(workshopTaskEvents)
        .where(eq(workshopTaskEvents.projectId, id))
        .orderBy(workshopTaskEvents.createdAt);

    const events = rawEvents.map(e => ({
        id: e.id,
        projectId: e.projectId,
        type: e.type,
        actor: e.actor,
        content: e.content,
        createdAt: e.createdAt ?? new Date().toISOString()
    }));

    return c.json({ events }, 200);
});

// 5. GET /events/recent (Global feed)
const getRecentGlobalEventsRoute = createRoute({
    operationId: 'getEventsRecent',
    method: 'get',
    path: '/events/recent',
    responses: {
        200: {
            description: 'List of recent global tasks',
            content: {
                'application/json': {
                    schema: z.object({
                        events: z.array(z.object({
                            id: z.string(),
                            projectId: z.string(),
                            projectName: z.string().optional(),
                            type: z.string(),
                            actor: z.string(),
                            content: z.any(),
                            createdAt: z.string()
                        }))
                    })
                }
            }
        }
    }
});

app.openapi(getRecentGlobalEventsRoute, async (c) => {
    const db = getDb(c.env.DB);
    // Fetch global events descending
    const rawEvents = await db.select({
        id: workshopTaskEvents.id,
        projectId: workshopTaskEvents.projectId,
        projectName: workshopProjects.name,
        type: workshopTaskEvents.type,
        actor: workshopTaskEvents.actor,
        content: workshopTaskEvents.content,
        createdAt: workshopTaskEvents.createdAt
    }).from(workshopTaskEvents)
      .leftJoin(workshopProjects, eq(workshopTaskEvents.projectId, workshopProjects.id))
      .orderBy(sql`${workshopTaskEvents.createdAt} DESC`)
      .limit(10);

    const formattedEvents = rawEvents.map(e => ({
        ...e,
        projectName: e.projectName ?? undefined,
        createdAt: e.createdAt || new Date().toISOString()
    }));

    return c.json({ events: formattedEvents }, 200);
});

// 6. GET /specialists
const getSpecialistsRoute = createRoute({
    operationId: 'getSpecialists',
    method: 'get',
    path: '/specialists',
    responses: {
        200: {
            description: 'List of available specialist agents',
            content: {
                'application/json': {
                    schema: z.array(z.object({
                        id: z.string(),
                        name: z.string(),
                        description: z.string(),
                        capabilities: z.array(z.string()),
                        icon: z.string()
                    }))
                }
            }
        }
    }
});

app.openapi(getSpecialistsRoute, async (c) => {
    const specialists = [
        {
            id: 'data-engineer',
            name: 'Data Engineering Specialist',
            description: 'Expert in D1, R2 SQL, and Data Modeling.',
            capabilities: ['Drizzle schema design', 'Data normalization', 'SQL migrations'],
            icon: 'Database'
        },
        {
            id: 'ux-architect',
            name: 'UX/Frontend Architect',
            description: 'Specializes in creating True Dark Shadcn UI designs.',
            capabilities: ['Astro SSR', 'React components', 'Framer Motion'],
            icon: 'Palette'
        },
        {
            id: 'sre-agent',
            name: 'SRE & Infra Agent',
            description: 'Ensures reliability, health checks, and secure worker deployment.',
            capabilities: ['Cloudflare configurations', 'Wrangler.json', 'Security rules'],
            icon: 'Settings'
        }
    ];

    return c.json(specialists, 200);
});

// 7. GET /inbox
const getInboxRoute = createRoute({
    operationId: 'getInbox',
    method: 'get',
    path: '/inbox',
    responses: {
        200: {
            description: 'List of blocked or decision_required events',
            content: { 'application/json': { schema: z.object({ events: z.array(z.any()) }) } }
        }
    }
});

app.openapi(getInboxRoute, async (c) => {
    const db = getDb(c.env.DB);
    const rawEvents = await db.select().from(workshopTaskEvents)
        .where(eq(workshopTaskEvents.status, 'blocked'))
        .orderBy(sql`${workshopTaskEvents.createdAt} DESC`);
    
    return c.json({ events: rawEvents as unknown[] }, 200) as any;
});

// 8. POST /decision
const postDecisionRoute = createRoute({
    operationId: 'postDecision',
    method: 'post',
    path: '/decision',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        eventId: z.string(),
                        decision: z.enum(['approved', 'rejected'])
                    })
                }
            }
        }
    },
    responses: {
        200: {
            description: 'Decision applied',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
        }
    }
});

app.openapi(postDecisionRoute, async (c) => {
    const db = getDb(c.env.DB);
    const body = c.req.valid('json');
    
    await db.update(workshopTaskEvents)
        .set({ status: body.decision })
        .where(eq(workshopTaskEvents.id, body.eventId));
        
    return c.json({ success: true }, 200);
});

// 9. GET /memory
const getMemoryRoute = createRoute({
    operationId: 'getMemory',
    method: 'get',
    path: '/memory',
    request: {
        query: z.object({ projectId: z.string() })
    },
    responses: {
        200: {
            description: 'Agent memory chunks',
            content: { 'application/json': { schema: z.object({ memory: z.array(z.any()) }) } }
        }
    }
});

app.openapi(getMemoryRoute, async (c) => {
    const db = getDb(c.env.DB);
    const { projectId } = c.req.valid('query');
    
    const chunks = await db.select().from(workshopAgentMemory)
        .where(eq(workshopAgentMemory.projectId, projectId));
        
    return c.json({ memory: chunks as unknown[] }, 200) as any;
});

// 10. POST /memory/resolve
const resolveMemoryRoute = createRoute({
    operationId: 'postMemoryResolve',
    method: 'post',
    path: '/memory/resolve',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        memoryId: z.string(),
                        resolvedContent: z.string()
                    })
                }
            }
        }
    },
    responses: {
        200: {
            description: 'Memory conflict resolved',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
        }
    }
});

app.openapi(resolveMemoryRoute, async (c) => {
    const db = getDb(c.env.DB);
    const body = c.req.valid('json');
    
    await db.update(workshopAgentMemory)
        .set({ content: body.resolvedContent, conflictStatus: 'resolved' })
        .where(eq(workshopAgentMemory.id, body.memoryId));
        
    return c.json({ success: true }, 200);
});

// 11. GET /stats/global
const getGlobalStatsRoute = createRoute({
    operationId: 'getStatsGlobal',
    method: 'get',
    path: '/stats/global',
    responses: {
        200: {
            description: 'Global workshop stats',
            content: { 'application/json': { schema: z.object({
                totalProjects: z.number(),
                totalEvents: z.number(),
                activeAgents: z.number()
            }) } }
        }
    }
});

app.openapi(getGlobalStatsRoute, async (c) => {
    const db = getDb(c.env.DB);
    const projCount = (await db.select({ count: sql`count(*)` }).from(workshopProjects))[0].count as number;
    const evntCount = (await db.select({ count: sql`count(*)` }).from(workshopTaskEvents))[0].count as number;
    
    return c.json({
        totalProjects: projCount,
        totalEvents: evntCount,
        activeAgents: 3
    }, 200);
});

// 12. GET /stats/agent/:id
const getAgentStatsRoute = createRoute({
    operationId: 'getStatsAgentId',
    method: 'get',
    path: '/stats/agent/{id}',
    request: {
        params: z.object({ id: z.string() })
    },
    responses: {
        200: {
            description: 'Agent-specific stats',
            content: { 'application/json': { schema: z.object({
                tasksCompleted: z.number(),
                errorRate: z.number(),
                velocity: z.number()
            }) } }
        }
    }
});

app.openapi(getAgentStatsRoute, async (c) => {
    return c.json({
        tasksCompleted: 42,
        errorRate: 1.5,
        velocity: 12.3
    }, 200);
});

// 13. GET /draft
const getDraftRoute = createRoute({
    operationId: 'getDraft',
    method: 'get',
    path: '/draft',
    request: {
        query: z.object({ projectId: z.string() })
    },
    responses: {
        200: {
            description: 'Get project draft',
            content: { 'application/json': { schema: z.object({
                success: z.boolean(),
                draftData: z.any()
            }) } }
        }
    }
});

app.openapi(getDraftRoute, async (c) => {
    const db = getDb(c.env.DB);
    const { projectId } = c.req.valid('query');
    const proj = await db.select().from(workshopProjects).where(eq(workshopProjects.id, projectId)).limit(1);
    const draftData = proj.length > 0 ? (proj[0].draftData || {}) : {};
    return c.json({ success: true, draftData }, 200);
});

export default app;
