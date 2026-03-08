import type { CommandResult, PushContext } from '@/automations/push/fixers/worker_types';
import { BaseAgent } from '@/ai/agents/base/BaseAgent';
import { generateStructuredResponse } from '@/ai/providers';

export class Implementer extends BaseAgent {

    /**
     * Triggered by "/colby implement" in an Issue.
     */
    async scaffoldFromIssue(ctx: PushContext, instructions: string, issueNumber: number, issueBody: string): Promise<CommandResult> {
        this.logger.info(`Scaffolding for issue #${issueNumber}`);

        let fileTreeStr = "Server Error: Could not fetch tree";
        try {
            const { data: treeData } = await ctx.octokit.git.getTree({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                tree_sha: ctx.repo.defaultBranch,
                recursive: 'true'
            });
            // Filter to just paths to save tokens
            const paths = treeData.tree.map((t: any) => t.path).join('\n');
            fileTreeStr = paths.substring(0, 10000); // Truncate
        } catch (e) {
            this.logger.error('Failed to get tree', { error: e });
        }

        const branchName = `colby/feature-${issueNumber}-${Date.now()}`;

        try {
            // A. Create Branch
            const { data: refData } = await ctx.octokit.git.getRef({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                ref: `heads/${ctx.repo.defaultBranch}`,
            });
            const baseSha = refData.object.sha;

            await ctx.octokit.git.createRef({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                ref: `refs/heads/${branchName}`,
                sha: baseSha,
            });

            // B. AI Planning
            this.logger.info(`Running AI planner for issue #${issueNumber}`);
            
            const systemPrompt = `You are an expert staff software engineer. Create a well-structured implementation file based on the User's Issue and repository context.`;
            const prompt = `Using strict file tree: \n${fileTreeStr}\n Create a plan for issue: ${issueBody}\n instructions: ${instructions}`;
            
            const schema = {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "The path of the primary new file to create, e.g., src/features/new-feature.ts" },
                    fileContent: { type: "string", description: "The entire code content for this new file" },
                    prTitle: { type: "string", description: "A concise, conventional commit styled PR title" },
                    prDescription: { type: "string", description: "A markdown summary of what was implemented" }
                },
                required: ["filePath", "fileContent", "prTitle", "prDescription"],
                additionalProperties: false
            };

            const plan = await generateStructuredResponse<{
                filePath: string,
                fileContent: string,
                prTitle: string,
                prDescription: string
            }>(
                ctx.env,
                prompt,
                schema,
                systemPrompt,
                { model: "@cf/meta/llama-3.1-8b-instruct" },
                "worker-ai"
            );

            await ctx.octokit.repos.createOrUpdateFileContents({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                path: plan.filePath,
                message: `feat: implement issue #${issueNumber}`,
                content: btoa(plan.fileContent),
                branch: branchName
            });

            // C. Create PR
            const { data: pr } = await ctx.octokit.pulls.create({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                title: plan.prTitle,
                head: branchName,
                base: ctx.repo.defaultBranch,
                body: `${plan.prDescription}\n\nTriggered by: \`/colby implement\``
            });

            return {
                type: 'reply',
                body: `🚀 **I have started working on this!**\n\nI created a new branch and Pull Request with a scaffold: ${pr.html_url}`
            };

        } catch (e: any) {
            this.logger.error('Failed execution', { error: e });
            return {
                type: 'reply',
                body: `❌ **Failed to scaffold:** ${e.message}`
            };
        }
    }

    async generateTests(_ctx: PushContext): Promise<CommandResult> {
        return { type: 'reply', body: "🧪 **Generating tests...** (Mock: Not implemented yet)" };
    }
}
