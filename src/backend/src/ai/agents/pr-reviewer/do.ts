import { DurableObject } from "cloudflare:workers";
import { createSupervisorAgent, createCodeReviewAgent, createSummaryAgent } from "./agents";
import { chunkFiles,  } from "./utils/chunking";
import { shouldReviewFile } from "./utils/filter";

export class PRSupervisorDO extends DurableObject<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async fetchAndProcess(octokitCtx: any, owner: string, repo: string, pullNumber: number) {
    const supervisor = createSupervisorAgent(this.env as any, octokitCtx);
    // Orchestration logic happens here or in a separate orchestrator
    return "supervisor_done";
  }
}

export class PRReviewDO extends DurableObject<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }
}

export class PRSummaryDO extends DurableObject<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }
}
