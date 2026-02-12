/**
 * @file backend/src/agents/ResearchAgent.ts
 * @description Stateful orchestrator for the Agentic Research Team
 * @owner Agentic Research Team
 */

import { callable } from "agents";
import { BaseAgent, BaseAgentState } from "@agent-sdk";
import { Logger } from "@logging";
import { Agent } from "@openai/agents";
import { getAgentModelName } from "@model-config";

interface ResearchState extends BaseAgentState {
  currentPlan: string | null;
  workflowId: string | null;
  researchStatus: "idle" | "planning" | "researching" | "review_required" | "completed";
  findings: any | null;
  approvalRequired: boolean;
}

export class ResearchAgent extends BaseAgent<Env, ResearchState> {
  protected logger: Logger;
  protected agent!: Agent;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.logger = new Logger(env, "ResearchAgent");
  }

  initialState: ResearchState = {
    currentPlan: null,
    workflowId: null,
    researchStatus: "idle",
    findings: null,
    approvalRequired: false,
    status: "idle",
    history: [],
  };

  async onStart(): Promise<void> {
    this.logger.info("ResearchAgent initialized");
    
    // Initialize agent without tools for now (type incompatibility with @openai/agents)
    // TODO: Migrate to Cloudflare Agents SDK tools pattern
    this.agent = new Agent({
      name: "ResearchAgent",
      model: getAgentModelName('ResearchAgent'), // Cost-optimized: gpt-4o
      instructions: `You are a senior research analyst specializing in GitHub repository analysis.
      
Your capabilities:
- Search and analyze GitHub repositories
- Clone repositories for deep code analysis
- Generate insights about code architecture and patterns
- Query vectorized code embeddings for semantic search

When a user asks you to research a repository:
1. Generate a research plan
2. Use tools to gather information
3. Trigger deep analysis workflows when needed
4. Synthesize findings into actionable insights

Always be thorough but concise. Focus on practical insights that developers can use.`,
    });
  }

  @callable()
  async onMessage(connection: any, message: any): Promise<any> {
    const messageText = typeof message === 'string' ? message : message.text || JSON.stringify(message);
    this.logger.info("Received research request", { message: messageText });

    try {
      // Update state to planning
      await this.setState({ ...this.state, researchStatus: "planning" });

      // Generate research plan using AI
      const planResult = await this.runAgent(this.agent, messageText);
      const plan = String(planResult.finalOutput || "");

      this.logger.info("Research plan generated", { plan });

      // Check if the plan requires deep analysis (workflow trigger)
      const requiresDeepAnalysis = this.shouldTriggerWorkflow(message, plan);

      if (requiresDeepAnalysis) {
        // Extract repo info from message
        const repoInfo = this.extractRepoInfo(message);

        if (repoInfo) {
          // Trigger workflow
          const instance = await this.env.DEEP_RESEARCH_WORKFLOW.create({
            params: {
              repoUrl: repoInfo.url,
              repoOwner: repoInfo.owner,
              repoName: repoInfo.name,
              mode: "targeted",
            },
          });


          await this.setState({
            ...this.state,
            currentPlan: plan,
            workflowId: instance.id,
            researchStatus: "researching",
          });

          this.logger.info("Workflow triggered", { workflowId: instance.id });

          return {
            status: "researching",
            plan,
            workflowId: instance.id,
            message: "Deep research workflow initiated. This may take a few minutes.",
          };
        }
      }

      // For simpler queries, return the plan directly
      await this.setState({
        ...this.state,
        currentPlan: plan,
        researchStatus: "completed",
      });

      return {
        status: "completed",
        plan,
        message: "Research completed",
      };
    } catch (error: any) {
      this.logger.error("Research failed", { error: error.message });
      await this.setState({ ...this.state, researchStatus: "idle" });
      
      return {
        status: "error",
        error: error.message,
      };
    }
  }

  @callable()
  async getStatus(): Promise<any> {
    return {
      status: this.state.researchStatus,
      plan: this.state.currentPlan,
      workflowId: this.state.workflowId,
      findings: this.state.findings,
    };
  }

  @callable()
  async reportProgress(workflowId: string, findings: any): Promise<void> {
    this.logger.info("Workflow progress reported", { workflowId, findings });
    
    await this.setState({
      ...this.state,
      findings,
      researchStatus: "review_required",
      approvalRequired: true,
    });
  }

  @callable()
  async approveFindings(): Promise<any> {
    await this.setState({
      ...this.state,
      researchStatus: "completed",
      approvalRequired: false,
    });

    return {
      status: "approved",
      findings: this.state.findings,
    };
  }

  /**
   * Determines if a workflow should be triggered based on the message and plan
   */
  private shouldTriggerWorkflow(message: string, plan: string): boolean {
    const keywords = ["analyze", "deep dive", "research", "clone", "vectorize", "index"];
    const lowerMessage = message.toLowerCase();
    const lowerPlan = plan.toLowerCase();

    return keywords.some(
      (keyword) => lowerMessage.includes(keyword) || lowerPlan.includes(keyword)
    );
  }

  /**
   * Extracts repository information from a message
   */
  private extractRepoInfo(message: string): { owner: string; name: string; url: string } | null {
    // Match patterns like "facebook/react" or "https://github.com/facebook/react"
    const repoPattern = /(?:https?:\/\/github\.com\/)?([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/;
    const match = message.match(repoPattern);

    if (match) {
      const owner = match[1];
      const name = match[2];
      return {
        owner,
        name,
        url: `https://github.com/${owner}/${name}.git`,
      };
    }

    return null;
  }
}
