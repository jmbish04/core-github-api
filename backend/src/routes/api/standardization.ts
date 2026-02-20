import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getDb } from '@db';
import { standardizationRules } from '@db/schemas/app/standardization';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { Bindings } from '@utils/hono';
import { Octokit } from 'octokit';
import { getOctokit } from '@/services/octokit/core';

const standardizationApi = new OpenAPIHono<{ Bindings: Env }>();

// Schema for Rule Metadata
const RuleSchema = z.object({
    id: z.string(),
    sourceRepo: z.string(),
    filePath: z.string(),
    description: z.string().nullable(),
    relevantInfra: z.array(z.string()),
    irrelevantInfra: z.array(z.string()),
    aiInstructions: z.string().nullable(),
    shouldOverwrite: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string()
});

const CreateRuleSchema = RuleSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial({
    sourceRepo: true,
    relevantInfra: true,
    irrelevantInfra: true,
    shouldOverwrite: true
});

// --- Routes ---

// List Rules
standardizationApi.openapi(createRoute({
    method: 'get',
    path: '/rules',
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: z.array(RuleSchema)
                }
            },
            description: 'List all standardization rules'
        }
    }
}), async (c) => {
    const db = getDb(c.env.DB);
    const rules = await db.select().from(standardizationRules).all();
    
    return c.json(rules.map(r => ({
        ...r,
        relevantInfra: JSON.parse(r.relevantInfra),
        irrelevantInfra: JSON.parse(r.irrelevantInfra),
        shouldOverwrite: Boolean(r.shouldOverwrite)
    })));
});

// Create Rule
standardizationApi.openapi(createRoute({
    method: 'post',
    path: '/rules',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: CreateRuleSchema
                }
            }
        }
    },
    responses: {
        201: {
            content: {
                'application/json': {
                    schema: RuleSchema
                }
            },
            description: 'Rule created'
        }
    }
}), async (c) => {
    const db = getDb(c.env.DB);
    const body = await c.req.json();
    const id = uuidv4();
    const now = new Date().toISOString();

    const newRule = {
        id,
        sourceRepo: body.sourceRepo || 'jmbish04/core-github-standardization',
        filePath: body.filePath,
        description: body.description || null,
        relevantInfra: JSON.stringify(body.relevantInfra || []),
        irrelevantInfra: JSON.stringify(body.irrelevantInfra || []),
        aiInstructions: body.aiInstructions || null,
        shouldOverwrite: body.shouldOverwrite ?? false,
        createdAt: now,
        updatedAt: now
    };

    await db.insert(standardizationRules).values(newRule).run();

    return c.json({
        ...newRule,
        relevantInfra: JSON.parse(newRule.relevantInfra),
        irrelevantInfra: JSON.parse(newRule.irrelevantInfra),
        shouldOverwrite: Boolean(newRule.shouldOverwrite)
    }, 201);
});

// Update Rule
standardizationApi.openapi(createRoute({
    method: 'put',
    path: '/rules/:id',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: CreateRuleSchema.partial()
                }
            }
        }
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: RuleSchema
                }
            },
            description: 'Rule updated'
        },
        404: {
            description: 'Rule not found'
        }
    }
}), async (c) => {
    const db = getDb(c.env.DB);
    const id = c.req.param('id');
    const body = await c.req.json();
    const now = new Date().toISOString();

    const existing = await db.select().from(standardizationRules).where(eq(standardizationRules.id, id)).get();
    if (!existing) return c.json({ error: 'Rule not found' }, 404);

    const updateData: any = { updatedAt: now };
    if (body.sourceRepo !== undefined) updateData.sourceRepo = body.sourceRepo;
    if (body.filePath !== undefined) updateData.filePath = body.filePath;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.relevantInfra !== undefined) updateData.relevantInfra = JSON.stringify(body.relevantInfra);
    if (body.irrelevantInfra !== undefined) updateData.irrelevantInfra = JSON.stringify(body.irrelevantInfra);
    if (body.aiInstructions !== undefined) updateData.aiInstructions = body.aiInstructions;
    if (body.shouldOverwrite !== undefined) updateData.shouldOverwrite = body.shouldOverwrite;

    await db.update(standardizationRules).set(updateData).where(eq(standardizationRules.id, id)).run();
    
    const updated = await db.select().from(standardizationRules).where(eq(standardizationRules.id, id)).get();

    if (!updated) return c.json({ error: 'Rule not found after update' }, 404);

    return c.json({
        ...updated,
        relevantInfra: JSON.parse(updated.relevantInfra),
        irrelevantInfra: JSON.parse(updated.irrelevantInfra),
        shouldOverwrite: Boolean(updated.shouldOverwrite)
    });
});

// Delete Rule
standardizationApi.openapi(createRoute({
    method: 'delete',
    path: '/rules/:id',
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: z.object({ success: z.boolean() })
                }
            },
            description: 'Rule deleted'
        },
        404: { description: 'Rule not found' }
    }
}), async (c) => {
    const db = getDb(c.env.DB);
    const id = c.req.param('id');
    const result = await db.delete(standardizationRules).where(eq(standardizationRules.id, id)).run();

    if (!result.meta.changes) return c.json({ error: 'Rule not found' }, 404);
    return c.json({ success: true });
});


// AI Analysis Endpoint
standardizationApi.openapi(createRoute({
    method: 'post',
    path: '/analyze',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        repo: z.string().default('jmbish04/core-github-standardization'),
                        filePath: z.string()
                    })
                }
            }
        }
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: z.object({
                        description: z.string(),
                        relevantInfra: z.array(z.string()),
                        irrelevantInfra: z.array(z.string())
                    })
                }
            },
            description: 'AI Analysis result'
        },
        404: {
            content: {
                'application/json': {
                    schema: z.object({ error: z.string() })
                }
            },
            description: 'File not found'
        },
        500: {
            content: {
                'application/json': {
                    schema: z.object({
                        description: z.string(),
                        relevantInfra: z.array(z.string()),
                        irrelevantInfra: z.array(z.string())
                    })
                }
            },
            description: 'Analysis failed (fallback)'
        }
    }
}), async (c) => {
    const { repo, filePath } = await c.req.json();
    const octokit = await getOctokit(c.env);
    
    // Fetch file content
    let content = '';
    try {
        const [owner, repoName] = repo.split('/');
        const { data } = await octokit.rest.repos.getContent({
            owner,
            repo: repoName,
            path: filePath
        });
        
        if ('content' in data) {
            content = Buffer.from(data.content, 'base64').toString('utf-8');
        }
    } catch (e: any) {
        return c.json({ error: `Failed to fetch file: ${e.message}` }, 404);
    }

    // Call AI to analyze
    // Using Workers AI here as a lightweight analyzer
    const prompt = `
    Analyze the following configuration/standardization file and determining the following:
    1. A short description of what this file does.
    2. A list of infrastructure tags (relevant_infra) where this file SHOULD be installed (e.g., "cloudflare_worker", "python", "nextjs").
    3. A list of infrastructure tags (irrelevant_infra) where this file MUST NOT be installed.

    File Path: ${filePath}
    File Content:
    ${content.slice(0, 2000)}... (truncated)

    Output STRICT JSON:
    {
        "description": "string",
        "relevantInfra": ["tag1", "tag2"],
        "irrelevantInfra": ["tag3", "tag4"]
    }
    `;

    try {
        const ai = c.env.AI;
        const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
            messages: [
                { role: 'system', content: 'You are a DevOps expert. Output strict JSON only.' },
                { role: 'user', content: prompt }
            ]
        });

        // Parse JSON from response
        // Using a simple regex to extract JSON block if needed, assuming the model might chat
        const jsonMatch = (response as any).response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return c.json(JSON.parse(jsonMatch[0]));
        }
        return c.json(JSON.parse((response as any).response));

    } catch (e: any) {
        console.error('AI Analysis failed:', e);
        // Fallback or error
        return c.json({
            description: 'Auto-analysis failed',
            relevantInfra: [],
            irrelevantInfra: []
        }, 500); // Changed to 500 but adhering to success schema for fallback?
        // Actually, let's return 200 with fallback data as implied by original implementation OR change to verify error.
        // Original code returned 200 for fallback. Let's stick to that but the fetch error returns 404.
    }
});

export default standardizationApi;
