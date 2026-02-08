/**
 * @file src/gardener/orchestrator.ts
 * @description Main entry point for the Gardener system. Wires events to audits and fixers.
 * @owner AI-Builder
 */

import type { Context } from 'hono'
import { CodeAuditor } from './auditor'
import { WorkerTypeFixer } from './fixers/worker-type-fixer'
import type { GardenerContext, AuditResult } from './types'
import { getDb } from '../db'
import { repositories } from '../db/schema-repos'
import { eq } from 'drizzle-orm'
import { fetchTemplateFiles } from '../tools/templates'
import { encode } from '../utils/base64'

// Registry of available fixers
const FIXERS = [
    new WorkerTypeFixer()
];

export class GardenerOrchestrator {

    /**
     * Handles a Push event (or Repository Created).
     * Runs a quick audit and applies fixes if critical.
     */
    static async handlePushEvent(
        c: Context,
        octokit: any,
        payload: any
    ) {
        const repo = payload.repository;
        const commitSha = payload.after;
        const db = getDb(c.env.DB);

        console.log(`[Gardener] Analyzing push to ${repo.full_name} (${commitSha})`);

        // 1. Build Context
        const ctx: GardenerContext = {
            env: c.env,
            executionCtx: c.executionCtx,
            repo: {
                owner: repo.owner.login || repo.owner.name,
                name: repo.name,
                defaultBranch: repo.default_branch
            },
            octokit
        };

        // 0. Gardening / Infrastructure Check (Road Trip Maintenance)
        // Check if we know this repo's infrastructure
        const [repoData] = await db.select().from(repositories).where(eq(repositories.id, `github:${ctx.repo.owner}/${ctx.repo.name}`));

        // 0a. Gardening / Infrastructure Check
        if (repoData && repoData.infrastructure) {
            console.log(`[Gardener] Checking infrastructure integrity for ${repoData.infrastructure}`);
            const standardFiles = await fetchTemplateFiles(c.env, repoData.infrastructure, ctx.repo.name);
            await this.ensureFilesExist(ctx, standardFiles);
        }

        // 0b. Cloudflare LLM Docs Enrichment (Auto-Docs)
        // Check if it's a Worker/Pages repo by looking for wrangler.toml/json
        const { data: contents } = await octokit.repos.getContent({
            owner: ctx.repo.owner,
            repo: ctx.repo.name,
            path: ''
        }).catch(() => ({ data: [] }));

        const isWorker = Array.isArray(contents) && contents.some((f: any) =>
            f.name === 'wrangler.toml' || f.name === 'wrangler.json' || f.name === 'wrangler.jsonc'
        );

        if (isWorker) {
            console.log(`[Gardener] Detected Cloudflare Worker. Ensuring .agents/llms-txt/ exists...`);
            await this.enrichWorkerDocs(ctx, db);
        }

        // 2. Fetch modified files (simple version: just check the commit)
        try {
            const { data: commit } = await octokit.repos.getCommit({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                ref: commitSha
            });

            const files = commit.files || [];
            const results: AuditResult[] = [];

            for (const file of files) {
                if (file.status === 'removed') continue;

                if (file.filename.endsWith('.ts')) {
                    const { data: fileContent } = await octokit.repos.getContent({
                        owner: ctx.repo.owner,
                        repo: ctx.repo.name,
                        path: file.filename,
                        ref: commitSha
                    });

                    if ('content' in fileContent) {
                        const decoded = atob(fileContent.content);
                        const fileAudits = CodeAuditor.scanFile(file.filename, decoded);
                        results.push(...fileAudits);
                    }
                }
            }

            console.log(`[Gardener] Audit complete. Found ${results.length} issues.`);

            // 3. Fix Phase
            for (const issue of results) {
                const fixer = FIXERS.find(f => f.canFix(issue));
                if (fixer) {
                    console.log(`[Gardener] Applying fixer: ${fixer.name}`);
                    await fixer.execute(ctx, issue);
                }
            }

        } catch (err) {
            console.error('[Gardener] Error in orchestration:', err);
        }
    }

    private static async ensureFilesExist(ctx: GardenerContext, files: Record<string, string>) {
        for (const [path, content] of Object.entries(files)) {
            try {
                await ctx.octokit.repos.getContent({
                    owner: ctx.repo.owner,
                    repo: ctx.repo.name,
                    path
                });
            } catch (e: any) {
                if (e.status === 404) {
                    console.log(`[Gardener] Missing file ${path}, restoring...`);
                    await ctx.octokit.repos.createOrUpdateFileContents({
                        owner: ctx.repo.owner,
                        repo: ctx.repo.name,
                        path,
                        message: `chore(gardener): restore missing ${path}`,
                        content: encode(content)
                    });
                }
            }
        }
    }

    private static async enrichWorkerDocs(ctx: GardenerContext, db: any) {
        // Dynamic import to avoid circular dependencies if any, though likely safe to import at top
        const { CLOUDFLARE_BINDING_MAP } = await import('../services/landingGenerator/cloudflareBindings');

        // 1. Always ensure standard LLM docs
        const standardDocs = {
            '.agents/llms-txt/cloudflare-llms.txt': 'https://developers.cloudflare.com/llms.txt',
            '.agents/llms-txt/cloudflare-llms-full.txt': 'https://developers.cloudflare.com/llms-full.txt',
            '.agents/llms-txt/workers-llms-full.txt': 'https://developers.cloudflare.com/workers/llms-full.txt',
        };

        let docsEnriched = false;

        for (const [path, url] of Object.entries(standardDocs)) {
            try {
                // Check if exists
                await ctx.octokit.repos.getContent({ owner: ctx.repo.owner, repo: ctx.repo.name, path });
                docsEnriched = true;
            } catch (e: any) {
                if (e.status === 404) {
                    console.log(`[Gardener] Downloading ${url} to ${path}`);
                    const content = await fetch(url).then(r => r.text());
                    await ctx.octokit.repos.createOrUpdateFileContents({
                        owner: ctx.repo.owner,
                        repo: ctx.repo.name,
                        path,
                        message: `docs: Add standard Cloudflare LLM txt`,
                        content: encode(content)
                    });
                    docsEnriched = true;
                }
            }
        }

        // 2. Ensure AGENTS.md instructions
        if (docsEnriched) {
            await this.ensureAgentsMdReferencesLlmsTxt(ctx);
        }
    }

    private static async ensureAgentsMdReferencesLlmsTxt(ctx: GardenerContext) {
        const path = '.agent/AGENTS.md'; // Assuming standard location, or could be AGENTS.md root. Trying .agent first as per patterns.
        // Actually, let's check root or standard locations. Best practice is .agent or root.
        // Let's assume root for simplicity or check both.
        // For now, let's target the root AGENTS.md as it's the most likely intended "human/agent" contract.

        const targetPath = 'AGENTS.md';
        const instruction = `\n\n## Cloudflare Context\n\nWhen working on Cloudflare Workers/Pages tasks, ALWAYS reference the documentation in \`.agents/llms-txt/\` if you are unsure about bindings or specific APIs.\n`;

        try {
            const { data } = await ctx.octokit.repos.getContent({ owner: ctx.repo.owner, repo: ctx.repo.name, path: targetPath }) as any;

            if ('content' in data) {
                const content = atob(data.content);
                if (!content.includes('.agents/llms-txt/')) {
                    console.log(`[Gardener] Enroll AGENTS.md with LLM txt instructions`);
                    const newContent = content + instruction;
                    await ctx.octokit.repos.createOrUpdateFileContents({
                        owner: ctx.repo.owner,
                        repo: ctx.repo.name,
                        path: targetPath,
                        message: `docs: update AGENTS.md with LLM context instructions`,
                        content: encode(newContent),
                        sha: data.sha
                    });
                }
            }
        } catch (e: any) {
            if (e.status === 404) {
                // Should we create it? Maybe. The user said "the gardner should also be checking the AGENTS.md file".
                // If it doesn't exist, we probably shouldn't force it unless requested, but let's create a stub since we added the docs.
                console.log(`[Gardener] Creating AGENTS.md with LLM instructions`);
                await ctx.octokit.repos.createOrUpdateFileContents({
                    owner: ctx.repo.owner,
                    repo: ctx.repo.name,
                    path: targetPath,
                    message: `docs: init AGENTS.md`,
                    content: encode(`# Repository Agents Guide\n${instruction}`)
                });
            }
        }
    }

}
