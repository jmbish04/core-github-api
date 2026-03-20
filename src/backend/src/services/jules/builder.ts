import { JulesService } from './service';
import type { StartSessionParams } from './types';

export class JulesSessionBuilder {
  private params: StartSessionParams = { prompt: '' };
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  withPrompt(prompt: string) {
    this.params.prompt = prompt;
    return this;
  }

  withRepo(owner: string, repo: string, branch?: string) {
    this.params.repo = { owner, repo, branch };
    return this;
  }

  withAgentId(agentId: string) {
    this.params.agentId = agentId;
    return this;
  }

  withAutoPr(autoPr: boolean = true) {
    this.params.autoPr = autoPr;
    return this;
  }

  withoutAutoPr() {
    this.params.autoPr = false;
    return this;
  }

  withApproval(requireApproval: boolean = true) {
    this.params.requireApproval = requireApproval;
    return this;
  }

  withoutApproval() {
    this.params.requireApproval = false;
    return this;
  }

  withProjectId(projectId?: string) {
    if (projectId) this.params.projectId = projectId;
    return this;
  }

  withPlanningRequest(requestId: string, role: string) {
    this.params.planningRequestId = requestId;
    this.params.sessionRole = role;
    return this;
  }

  withSessionId(sessionId: string) {
    this.params.sessionId = sessionId;
    return this;
  }

  build(): StartSessionParams {
    return this.params;
  }

  async start() {
    if (!this.params.prompt) throw new Error('Cannot start Jules session without a prompt.');
    return JulesService.getInstance(this.env).startSession(this.params);
  }

  async run() {
    if (!this.params.prompt) throw new Error('Cannot run Jules task without a prompt.');
    return JulesService.getInstance(this.env).runSession(this.params.prompt);
  }
}
