import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { Logger } from "@/lib/logger";

export type AgentWorkflowEvent<TPayload> = WorkflowEvent<TPayload>;
export type AgentWorkflowStep = WorkflowStep & { reportComplete: (payload: unknown) => Promise<void> };

export class AgentWorkflow<TEnv extends Env = Env, TPayload = unknown> extends WorkflowEntrypoint<TEnv, TPayload> {
  protected async reportProgress(payload: Record<string, unknown>): Promise<void> {
    const logger = new Logger(this.env, "AgentWorkflow");
    const logPreface = `[AgentWorkflow - reportProgress] `;
    logger.info(`${logPreface}Progress: ${JSON.stringify(payload)}`);
  }

  protected async waitForApproval<T = { approvedBy: string }>(
    _step: WorkflowStep,
    _options?: Record<string, unknown>,
  ): Promise<T> {
    const logger = new Logger(this.env, "AgentWorkflow");
    const logPreface = `[AgentWorkflow - waitForApproval] `;
    logger.warn(`${logPreface}Approval requested; using compatibility auto-approval path`);
    return { approvedBy: 'compat-workflow-runtime' } as T;
  }
}
