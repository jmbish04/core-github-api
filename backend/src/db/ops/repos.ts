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
import type { RepoAnalysis } from '@/ai/mcp/tools/github/repo-analysis'

export async function upsertRepoAnalysis(d1: D1Database, analysis: RepoAnalysis, manualId?: string) {
    const db = getDb(d1);

    // 1. Determine ID
    const repoId = manualId || analysis.id || `github:${analysis.owner}/${analysis.name}`;

    // 2. Transaction
    await db.transaction(async (tx) => {
        // A. Upsert Repository
        await tx.insert(repositories).values({
            id: repoId,
            provider: analysis.provider,
            owner: analysis.owner || 'unknown',
            name: analysis.name || 'unknown',
            slug: repoId, // Assuming slug is ID
            repoUrl: `https://github.com/${analysis.owner}/${analysis.name}`, // Construct URL
            description: analysis.description,
            topicsJson: JSON.stringify(analysis.topics),
            visibility: analysis.visibility,
            lifecycleStage: analysis.lifecycleStage,
            isTemplate: analysis.isTemplate,
            criticality: analysis.criticality,
            createdAt: new Date().toISOString(), // Fallback if not provided in analysis? Using current Time for now.
            updatedAt: new Date().toISOString(),
            humanSummary: analysis.humanSummary,
            aiSummary: analysis.aiSummary,
            notes: analysis.notes
        }).onConflictDoUpdate({
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
        });

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
}
