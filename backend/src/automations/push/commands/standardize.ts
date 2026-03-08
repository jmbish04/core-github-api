import type { CommandResult, ISlashCommand } from '../fixers/worker_types';
import { JulesService } from '@/services/jules/jules';
import { generateUuid } from '@/utils/common';

export const StandardizeCommand: ISlashCommand = {
  name: 'standardize',
  description: 'Full repo audit & fix using explicit active standardizations.',
  async handle(_args, ctx, metadata): Promise<CommandResult | null> {
    if (!metadata.issueNumber) {
      return { type: 'reply', body: "❌ Error: Cannot run standardize outside of an issue or PR context." };
    }

    try {
        // 1. Fetch PR Context (Diff/Files)
        let prDiff = "";
        try {
            const diffResp = await ctx.octokit.rest.pulls.get({
                owner: ctx.repo.owner,
                repo: ctx.repo.name,
                pull_number: metadata.issueNumber,
                mediaType: { format: "diff" }
            });
            prDiff = diffResp.data as unknown as string;
        } catch (_e) {
            // Error intentionally swallowed for fallback
            prDiff = metadata.issueBody || "No provided text context.";
        }

        // 2. Invoke StandardizationAgent
        const agentId = (ctx.env as Record<string, any>).STANDARDIZATION_AGENT.idFromName(`standardize-${ctx.repo.owner}-${ctx.repo.name}-${metadata.issueNumber}`);
        const agentStub = (ctx.env as Record<string, any>).STANDARDIZATION_AGENT.get(agentId) as Record<string, any>; // Cast as bypass since SDK stubs dynamically
        let julesPrompt = "Please analyze and fix this PR using standard engineering practices.";

        if(agentStub.runAnalysis) {
            // If native RPC via Agents SDK behaves correctly
            julesPrompt = await agentStub.runAnalysis(prDiff, metadata.issueNumber, ctx.repo.owner, ctx.repo.name);
        } else {
            // Backup execution pattern if DO SDK does not export runAnalysis directly (using DO fetch proxy)
             julesPrompt = `Please ensure all active codebase standardization rules are applied to PR #${metadata.issueNumber}.`;
        }

        // 3. Initiate Jules Service Fix workflow
        const sessionId = generateUuid();
        const jules = JulesService.getInstance(ctx.env);
        await jules.startSession({
             sessionId,
             repo: { owner: ctx.repo.owner, repo: ctx.repo.name },
             prompt: julesPrompt,
             autoPr: false
        });

        return { type: 'reply', body: "✨ **Standardization initialized**. I am actively scanning the latest standardizations and dispatching Jules to audit and commit fixes directly to this PR." };
    } catch (e: any) {
        console.error("StandardizeCommand Error:", e);
        return { type: 'reply', body: `❌ **Failed to initiate standardization audit:** ${e.message}` };
    }
  }
};
