import { BaseAutomation } from '@/core/BaseAutomation';
import { JulesService } from "@/services/jules/jules";
import { JULES_STANDARDS } from "@/config/jules-standards";

export class JulesStandardsPush extends BaseAutomation {
  async shouldExecute(): Promise<boolean> {
    return this.payload.ref === `refs/heads/${this.payload.repository?.default_branch}`;
  }

  async execute(): Promise<void> {
    try {
        const julesService = JulesService.getInstance(this.env);
        await julesService.startSession({
            prompt: `New Push detected to ${this.payload.repository?.full_name}. Analyze this push for standards compliance.\n\n${JULES_STANDARDS}`,
            repo: {
                owner: this.payload.repository?.owner?.login,
                repo: this.payload.repository?.name,
                branch: this.payload.repository?.default_branch
            }
        });
        await this.logExecution('success', 'Jules standards analysis dispatched');
    } catch (err: unknown) {
        console.error('[Jules] Failed to start analysis:', err);
        await this.logExecution('failure', `Jules analysis failed: ${err.message}`);
    }
  }
}
