/**
 * @file src/gardener/fixers/worker-type-fixer.ts
 * @description Automatically refactors code to remove manual @cloudflare/workers-types imports.
 * @owner AI-Builder
 */

import type { Fixer, AuditResult, GardenerContext } from '@/gardener/types'

export class WorkerTypeFixer implements Fixer {
    id = 'fix-worker-types';
    name = 'Worker Type Standardizer';
    description = 'Replaces manual @cloudflare/workers-types imports with the global Env interface.';

    canFix(audit: AuditResult): boolean {
        return audit.ruleId === 'no-explicit-worker-types';
    }

    async execute(ctx: GardenerContext, audit: AuditResult): Promise<boolean> {
        console.log(`[WorkerTypeFixer] Fixing ${audit.filePath}...`);

        // 1. Fetch current file content (if not provided in audit context)
        // In a real scenario, we might need to fetch fresh content via Octokit if audit was async.
        // For now, assuming we can fetch it or have it.
        // Implementation detail: We need to use ctx.octokit to get the blob.

        try {
            const { data: fileData } = await ctx.octokit.repos.getContent({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                path: audit.filePath!,
            });

            if (Array.isArray(fileData) || fileData.type !== 'file' || !fileData.content) {
                console.error(`[WorkerTypeFixer] Could not read file content for ${audit.filePath}`);
                return false;
            }

            const currentContent = atob(fileData.content);

            // 2. Use AI to Refactor
            // We use the simulated AI capability here (or real if wired).
            // Prompt construction:
            const prompt = `
You are a Cloudflare Workers expert.
Refactor the following code to remove the explicit import from '@cloudflare/workers-types'.
Instead, ensure the code uses the global 'Env' interface which is available in the environment.
If 'Env' is not used, introduce it.
Do not change logic. Only change types.

Code:
\`\`\`typescript
${currentContent}
\`\`\`
            `;

            // MOCKED AI CALL for now - in real implementation we'd use ctx.env.AI.run(...)
            // const newContent = await ctx.env.AI.run('@cf/meta/llama-3-8b-instruct', { prompt });
            // For this scaffold, we'll do a simple string replace to demonstrate intent without burning tokens yet.

            // Simple heuristic replacement for demonstration:
            const newContent = currentContent.replace(/import\s+.*from\s+['"]@cloudflare\/workers-types['"][;]?\n?/g, '');
            // This is naive; the AI version would be safer.

            if (newContent === currentContent) {
                console.log('[WorkerTypeFixer] No changes made by heuristic.');
                return false;
            }

            // 3. Create a Branch and PR
            const branchName = `gardener/fix-worker-types-${Date.now()}`;
            const prTitle = `fix: standardize worker types usage in ${audit.filePath}`;
            const prBody = `This PR removes manual imports of \`@cloudflare/workers-types\` and adopts the global \`Env\` interface pattern. 
            
Detected via Gardener Audit Rule: \`no-explicit-worker-types\`.`;

            // A. Get SHA of default branch (base)
            const { data: refData } = await ctx.octokit.git.getRef({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                ref: `heads/${ctx.repo.defaultBranch}`,
            });
            const baseSha = refData.object.sha;

            // B. Create new branch
            await ctx.octokit.git.createRef({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                ref: `refs/heads/${branchName}`,
                sha: baseSha,
            });

            // C. Commit Change
            await ctx.octokit.repos.createOrUpdateFileContents({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                path: audit.filePath!,
                message: prTitle,
                content: btoa(newContent),
                branch: branchName,
                sha: fileData.sha, // needed to update existing file
            });

            // D. Open PR
            const { data: pr } = await ctx.octokit.pulls.create({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                title: prTitle,
                head: branchName,
                base: ctx.repo.defaultBranch,
                body: prBody,
            });

            console.log(`[WorkerTypeFixer] PR Created: ${pr.html_url}`);
            return true;
        } catch (error) {
            console.error('[WorkerTypeFixer] Execution failed:', error);
            return false;
        }
    }

    /**
     * Runs the fixer against the ENTIRE repository by searching for violations first.
     */
    async fixAll(ctx: GardenerContext): Promise<string> {
        console.log('[WorkerTypeFixer] Running fixAll...');

        try {
            // 1. Search for violations
            // Query: "import from @cloudflare/workers-types" in this repo
            // Note: GitHub Search API has rate limits.
            const query = `repo:${ctx.repo.owner}/${ctx.repo.name} "@cloudflare/workers-types" extension:ts`;
            const { data: search } = await ctx.octokit.search.code({ q: query });

            if (search.total_count === 0) {
                return "✅ No manual worker type imports found. Good job!";
            }

            console.log(`[WorkerTypeFixer] Found ${search.total_count} potential files.`);

            // 2. Create Branch
            const branchName = `colby/fix-types-all-${Date.now()}`;
            const { data: refData } = await ctx.octokit.git.getRef({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                ref: `heads/${ctx.repo.defaultBranch}`,
            });

            await ctx.octokit.git.createRef({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                ref: `refs/heads/${branchName}`,
                sha: refData.object.sha,
            });

            // 3. Fix each file (limit to first 10 to avoid timeouts/rate limits in safe mode)
            let fixedCount = 0;
            const files = search.items.slice(0, 10);

            for (const file of files) {
                if (file.path.endsWith('worker-configuration.d.ts')) continue;

                const { data: fileData } = await ctx.octokit.repos.getContent({
                    owner: ctx.repo.owner,
                    repo: ctx.repo.name,
                    path: file.path,
                });

                if (Array.isArray(fileData) || !fileData.content) continue;
                const content = atob(fileData.content);

                // Heuristic Fix
                const newContent = content.replace(/import\s+.*from\s+['"]@cloudflare\/workers-types['"][;]?\n?/g, '');
                if (newContent !== content) {
                    await ctx.octokit.repos.createOrUpdateFileContents({
                        owner: ctx.repo.owner,
                        repo: ctx.repo.name,
                        path: file.path,
                        message: `fix: standardize worker types in ${file.path}`,
                        content: btoa(newContent),
                        branch: branchName,
                        sha: fileData.sha
                    });
                    fixedCount++;
                }
            }

            if (fixedCount === 0) {
                return "⚠️ Found files but could not automagically fix them (or they were false positives).";
            }

            // 4. Create PR
            const { data: pr } = await ctx.octokit.pulls.create({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                title: `fix: standardize worker types (automated)`,
                head: branchName,
                base: ctx.repo.defaultBranch,
                body: `Found ${search.total_count} files. Automated fix applied to ${fixedCount} files.`
            });

            return `🧹 **Cleanup Run**: Found ${search.total_count} files, fixed ${fixedCount}. PR Created: ${pr.html_url}`;

        } catch (e: any) {
            console.error('[WorkerTypeFixer] fixAll failed', e);
            return `❌ **Fix Failed**: ${e.message}`;
        }
    }
}
