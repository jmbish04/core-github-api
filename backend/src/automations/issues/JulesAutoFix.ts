import { BaseAutomation } from '@/core/BaseAutomation';
import { JulesService } from "@/services/jules/jules";
import { GitHubConditionals } from '@/utils/github/conditionals';

interface JulesPayload {
  action?: string;
  issue?: { number?: number };
  comment?: { body?: string; user?: { login?: string; type?: string; }};
  repository?: { name?: string; owner?: { login?: string; } };
}

export class JulesAutoFix extends BaseAutomation {
  async shouldExecute(): Promise<boolean> {
    const payload = this.payload as JulesPayload;
    if (!payload.comment) return false;

    const isGemini = GitHubConditionals.isBotOrAgentUser(payload.comment?.user);
    
    return !!isGemini && payload.action === 'created' && !!payload.issue?.number;
  }

  async execute(): Promise<void> {
    const payload = this.payload as JulesPayload;
    const feedback = payload.comment?.body;
    const prNumber = payload.issue?.number;

    if (feedback && (feedback.includes('Review') || feedback.includes('suggestion'))) {
      try {
          const julesService = JulesService.getInstance(this.env);
          const prompt = `Gemini Code Assist provided a review on PR #${prNumber}.\n\nFeedback:\n${feedback}\n\nPlease apply the fixes suggested in the feedback.`;
          await julesService.startSession({
              prompt: prompt,
              repo: { 
                  owner: payload.repository?.owner?.login || '', 
                  repo: payload.repository?.name || '',
              },
              autoPr: true 
          });
          await this.logExecution('success', 'Jules auto-fix session started', prNumber);
      } catch (err: unknown) {
          console.error(`[Jules] Failed to trigger auto-fix:`, err);
          await this.logExecution('failure', `Jules startSession failed: ${err instanceof Error ? err.message : String(err)}`, prNumber);
      }
    } else {
      await this.logExecution('skipped', 'No actionable feedback keywords found', prNumber);
    }
  }
}
