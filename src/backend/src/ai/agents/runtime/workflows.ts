import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';

export type AgentWorkflowEvent<TPayload> = WorkflowEvent<TPayload>;
export type AgentWorkflowStep = WorkflowStep & { reportComplete: (payload: unknown) => Promise<void> };

export class AgentWorkflow<TEnv extends Env = Env, TPayload = unknown> extends WorkflowEntrypoint<TEnv, TPayload> {
  protected async reportProgress(payload: Record<string, unknown>): Promise<void> {
    console.log('[AgentWorkflow] progress', payload);
  }

  protected async waitForApproval<T = { approvedBy: string }>(
    _step: WorkflowStep,
    _options?: Record<string, unknown>,
  ): Promise<T> {
    console.warn('[AgentWorkflow] approval requested; using compatibility auto-approval path');
    return { approvedBy: 'compat-workflow-runtime' } as T;
  }
}
