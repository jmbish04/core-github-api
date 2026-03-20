/**
 * @file src/db/repos.ts
 * @description Transactional upsert logic for Repositories and AI metadata.
 * @owner AI-Builder
 */

import { getDb } from '@db' // Assuming main db helper is at src/db/index.ts
import { projects } from '@db/schemas/projects/roadmap'
import {
    repositories,
    repoTechStack,
    repoMetrics,
    repoInfra,
    repoTags,
    type GitHubRepository,
    type NewGitHubRepository
} from '@db/schemas/github/repos'
import { eq } from 'drizzle-orm'

// 1. JSON Schema for Structured Output
export const REPO_ANALYSIS_JSON_SCHEMA = {
    name: "repo_analysis",
    schema: {
        type: "object",
        additionalProperties: false,
        properties: {
            id: { type: "string", description: "Stable repo identifier like 'github:owner/name'. If unknown, set to null." },
            provider: { type: "string", description: "SCM provider if known.", enum: ["github", "gitlab", "local", "unknown"], default: "unknown" },
            owner: { type: "string", description: "Repository owner/user/org if known.", nullable: true },
            name: { type: "string", description: "Repository name if known.", nullable: true },
            description: { type: "string", description: "2–4 sentence, high-signal functional description of this repo.", nullable: true },
            topics: { type: "array", description: "Short, lowercase tags derived from README, package.json, etc.", items: { type: "string" } },
            visibility: { type: "string", description: "Leave 'unknown' if not obvious.", enum: ["public", "private", "internal", "unknown"], default: "unknown" },
            lifecycleStage: { type: "string", description: "Stage based on cues like README wording, archived notes, etc.", enum: ["prototype", "active", "deprecated", "archived", "unknown"], default: "unknown" },
            isTemplate: { type: "boolean", description: "True if this is clearly meant to be reused as a starter/template." },
            criticality: { type: "integer", description: "0–10 subjective importance.", minimum: 0, maximum: 10 },
            humanSummary: { type: "string", description: "Copy a short, high-signal excerpt from README if suitable, else null.", nullable: true },
            aiSummary: { type: "string", description: "Your own concise summary highlighting architecture, stack, and main purpose.", nullable: true },
            stack: {
                type: "object",
                additionalProperties: false,
                properties: {
                    frontend: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            framework: { type: "string", description: "e.g. 'react','svelte','none','unknown'", nullable: true },
                            bundler: { type: "string", description: "e.g. 'vite','webpack','next','unknown'", nullable: true },
                            uiPrimitives: { type: "string", description: "e.g. 'radix-ui','headlessui','none','unknown'", nullable: true },
                            components: { type: "string", description: "e.g. 'shadcn','mui','chakra','none','unknown'", nullable: true },
                            styling: { type: "string", description: "e.g. 'tailwindcss','vanilla-extract','css-modules'", nullable: true }
                        },
                        required: ["framework", "bundler", "uiPrimitives", "components", "styling"]
                    },
                    backend: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            runtime: { type: "string", description: "e.g. 'cloudflare-workers','node','deno','python','none','unknown'", nullable: true },
                            framework: { type: "string", description: "e.g. 'fastify','express','hono','fastapi','none','unknown'", nullable: true }
                        },
                        required: ["runtime", "framework"]
                    },
                    testing: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            hasTests: { type: "boolean", description: "True if any obvious tests are present." },
                            testFramework: { type: "string", description: "e.g. 'vitest','jest','pytest','none','unknown'", nullable: true }
                        },
                        required: ["hasTests", "testFramework"]
                    }
                },
                required: ["frontend", "backend", "testing"]
            },
            infra: {
                type: "object",
                additionalProperties: false,
                properties: {
                    provider: { type: "string", description: "Primary runtime/infra provider.", enum: ["cloudflare", "gcp", "aws", "azure", "vercel", "unknown"], default: "unknown" },
                    usesWorkers: { type: "boolean" },
                    usesPages: { type: "boolean" },
                    usesD1: { type: "boolean" },
                    usesKv: { type: "boolean" },
                    usesR2: { type: "boolean" },
                    usesQueues: { type: "boolean" },
                    usesVectorize: { type: "boolean" },
                    wranglerPath: { type: "string", description: "Path to wrangler config file if present, else null.", nullable: true }
                },
                required: ["provider", "usesWorkers", "usesPages", "usesD1", "usesKv", "usesR2", "usesQueues", "usesVectorize", "wranglerPath"]
            },
            tags: { type: "array", description: "High-level tags.", items: { type: "string" } },
            notes: { type: "string", description: "Any extra observations." }
        },
        required: ["provider", "topics", "visibility", "lifecycleStage", "isTemplate", "criticality", "stack", "infra", "tags", "notes"]
    },
    strict: true
} as const;

export type RepoAnalysis = {
    id: string | null;
    provider: "github" | "gitlab" | "local" | "unknown";
    owner: string | null;
    name: string | null;
    description: string | null;
    topics: string[];
    visibility: "public" | "private" | "internal" | "unknown";
    lifecycleStage: "prototype" | "active" | "deprecated" | "archived" | "unknown";
    isTemplate: boolean;
    criticality: number;
    humanSummary: string | null;
    aiSummary: string | null;
    stack: {
        frontend: {
            framework: string | null;
            bundler: string | null;
            uiPrimitives: string | null;
            components: string | null;
            styling: string | null;
        };
        backend: {
            runtime: string | null;
            framework: string | null;
        };
        testing: {
            hasTests: boolean;
            testFramework: string | null;
        };
    };
    infra: {
        provider: "cloudflare" | "gcp" | "aws" | "azure" | "vercel" | "unknown";
        usesWorkers: boolean;
        usesPages: boolean;
        usesD1: boolean;
        usesKv: boolean;
        usesR2: boolean;
        usesQueues: boolean;
        usesVectorize: boolean;
        wranglerPath: string | null;
    };
    tags: string[];
    notes: string;
};

export async function upsertRepoAnalysis(d1: D1Database, analysis: RepoAnalysis, manualId?: string) {
    const db = getDb(d1);
    // 1. Determine ID
    const repoId = manualId || analysis.id || `github:${analysis.owner}/${analysis.name}`;

    let insertedRepo: GitHubRepository | null = null;
    let newRepoPayload: NewGitHubRepository;

    // 2. Transaction
    await db.transaction(async (tx) => {
        // Evaluate references to ensure schemas are linked safely behind the scenes
        // Ensure imported tables are "touched" in JS to avoid cold-boot issues in Drizzle
        void projects.id;
        void repoMetrics.repoId;

        newRepoPayload = {
            id: repoId,
            provider: analysis.provider,
            owner: analysis.owner || 'unknown',
            name: analysis.name || 'unknown',
            slug: repoId, 
            repoUrl: `https://github.com/${analysis.owner}/${analysis.name}`, 
            description: analysis.description,
            topicsJson: JSON.stringify(analysis.topics),
            visibility: analysis.visibility,
            lifecycleStage: analysis.lifecycleStage,
            isTemplate: analysis.isTemplate,
            criticality: analysis.criticality,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            humanSummary: analysis.humanSummary,
            aiSummary: analysis.aiSummary,
            notes: analysis.notes
        };

        // A. Upsert Repository
        const result = await tx.insert(repositories).values(newRepoPayload).onConflictDoUpdate({
            target: repositories.id,
            set: {
                description: analysis.description,
                topicsJson: JSON.stringify(analysis.topics),
                visibility: analysis.visibility,
                lifecycleStage: analysis.lifecycleStage,
                isTemplate: analysis.isTemplate,
                criticality: analysis.criticality,
                updatedAt: new Date().toISOString(),
                humanSummary: analysis.humanSummary,
                aiSummary: analysis.aiSummary,
                notes: analysis.notes
            }
        }).returning();
        
        insertedRepo = result[0] || null;

        // B. Replace Tech Stack (Delete all for this repo, then insert)
        await tx.delete(repoTechStack).where(eq(repoTechStack.repoId, repoId));

        const stackItems: typeof repoTechStack.$inferInsert[] = [];

        // Frontend
        if (analysis.stack.frontend) {
            Object.entries(analysis.stack.frontend).forEach(([key, value]) => {
                if (value) stackItems.push({ repoId, domain: 'frontend', key, value, source: 'ai_detected' });
            });
        }
        // Backend
        if (analysis.stack.backend) {
            Object.entries(analysis.stack.backend).forEach(([key, value]) => {
                if (value) stackItems.push({ repoId, domain: 'backend', key, value, source: 'ai_detected' });
            });
        }
        // Testing
        if (analysis.stack.testing) {
            Object.entries(analysis.stack.testing).forEach(([key, value]) => {
                // Ensure value is string
                if (value !== null && value !== undefined) {
                    stackItems.push({ repoId, domain: 'testing', key, value: String(value), source: 'ai_detected' });
                }
            });
        }

        if (stackItems.length > 0) {
            await tx.insert(repoTechStack).values(stackItems);
        }

        // C. Upsert Infra
        await tx.insert(repoInfra).values({
            repoId: repoId,
            provider: analysis.infra.provider,
            usesWorkers: analysis.infra.usesWorkers,
            usesPages: analysis.infra.usesPages,
            usesD1: analysis.infra.usesD1,
            usesKv: analysis.infra.usesKv,
            usesR2: analysis.infra.usesR2,
            usesQueues: analysis.infra.usesQueues,
            usesVectorize: analysis.infra.usesVectorize,
            wranglerPath: analysis.infra.wranglerPath,
            envsJson: null // analysis doesn't provide this yet
        }).onConflictDoUpdate({
            target: repoInfra.repoId,
            set: {
                provider: analysis.infra.provider,
                usesWorkers: analysis.infra.usesWorkers,
                usesPages: analysis.infra.usesPages,
                usesD1: analysis.infra.usesD1,
                usesKv: analysis.infra.usesKv,
                usesR2: analysis.infra.usesR2,
                usesQueues: analysis.infra.usesQueues,
                usesVectorize: analysis.infra.usesVectorize,
                wranglerPath: analysis.infra.wranglerPath
            }
        });

        // D. Replace Tags
        await tx.delete(repoTags).where(eq(repoTags.repoId, repoId));
        if (analysis.tags && analysis.tags.length > 0) {
            await tx.insert(repoTags).values(
                analysis.tags.map(tag => ({ repoId, tag }))
            );
        }
    });

    return insertedRepo as GitHubRepository | null;
}
