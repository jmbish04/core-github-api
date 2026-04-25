import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { Logger } from '@/lib/logger';
import { JulesService } from '@/services/jules/service';
import { getAgentByName } from 'agents';

export type JulesResearchParams = {
  sessionId: string;
  agentId: string;
};

export class JulesResearchWorkflow extends WorkflowEntrypoint<Env, JulesResearchParams> {
  async run(event: WorkflowEvent<JulesResearchParams>, step: WorkflowStep) {
    const logger = new Logger(this.env, 'JulesResearchWorkflow');
    const params = event.payload;

    try {
      logger.info(`Starting research monitoring for session ${params.sessionId}`);

      const maxRetries = 60; // 10 minutes max at 10s intervals
      let isComplete = false;
      let finalState = 'UNKNOWN';
      let resultData: any = null;

      for (let currentTry = 0; currentTry < maxRetries; currentTry++) {
        const checkResult = await step.do(`check-status-${currentTry}`, async () => {
          const julesService = JulesService.getInstance(this.env);
          const session = await julesService.getSession(params.sessionId);
          try {
            const info = await session.info();
            return { state: info?.state || 'RUNNING', data: info };
          } catch (err: any) {
             logger.warn(`Failed to fetch session info: ${err.message}`);
             return { state: 'RUNNING', data: null };
          }
        });

        if (checkResult.state === 'COMPLETED' || checkResult.state === 'completed' || checkResult.state === 'FAILED' || checkResult.state === 'failed' || checkResult.state === 'ready_for_pr') {
          isComplete = true;
          finalState = checkResult.state;
          resultData = checkResult.data;
          break; // Exit polling loop
        }

        await step.sleep(`sleep-10s-${currentTry}`, '10 seconds');
      }

      logger.info(`Jules session ${params.sessionId} completed with state ${finalState}`);

      await step.do('notify-agent', async () => {
        // Ping the ResearchAgent via RPC
        const agent = await getAgentByName(this.env.RESEARCH_AGENT as any, params.agentId);
        if (typeof (agent as any).onResearchComplete === 'function') {
           await (agent as any).onResearchComplete(params.sessionId, { state: finalState, data: resultData });
        }
      });
      
    } catch (error: any) {
      logger.error('JulesResearchWorkflow failed', { error });
      throw error;
    }
  }
}
