/**
 * Research Agent (Deep Repository Analysis)
 * 
 * A stateful orchestrator for the Agentic Research Team. It:
 * 1. Generates research plans for analyzing GitHub repositories.
 * 2. Uses specialized GitHub code search tools.
 * 3. Triggers asynchronous "Deep Research" workflows for long-running analysis.
 * 4. Synthesizes findings into actionable engineering insights.
 * 
 * @module AI/Agents/Research
 * @owner Agentic Research Team
 */
import { callable } from "agents";
import { BaseAgent, BaseAgentState } from "@/ai/agents/base/BaseAgent";
import { Logger } from "@logging";
import { getAgentModelName } from "@/ai/utils/model-config";
import { getOctokit } from "@services/octokit/core";
import { z } from "zod";
import { createBaseAgent } from "@/ai/agents/base/honidev";
import { tool } from "honidev";

interface ResearchState extends BaseAgentState {
  currentPlan: string | null;
  workflowId: string | null;
  researchStatus: "idle" | "planning" | "researching" | "review_required" | "completed";
  findings: any | null;
  approvalRequired: boolean;
}

/**
 * The ResearchAgent coordinates multi-stage repository analysis.
 */
export class ResearchAgent extends BaseAgent<Env, ResearchState> {
  // logger inherited from BaseAgent

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
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
  }

/**
 * Entry point for research requests.
 * Evaluates the query and determines if immediate analysis or a 
 * background workflow is required.
 */
  @callable()
  async onMessage(connection: any, message: any): Promise<any> {
    const messageText = typeof message === 'string' ? message : message.text || JSON.stringify(message);
    this.logger.info("Received research request", { message: messageText });

    try {
      // Update state to planning
      await this.setState({ ...this.state, researchStatus: "planning" });

      const honiAgent = createBaseAgent(
        this.env,
        "ResearchAgent",
        `You are a senior research analyst specializing in GitHub repository analysis.
        
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

Querying Code (Base Population Search):
- Use 'search_github_code' to find files.
- GitHub Code Search does NOT support regex. You must use qualifiers.
- Example: To find all "wrangler.jsonc" files in org "cloudflare", use query: "org:cloudflare filename:wrangler.jsonc".
- Use 'regex_filter' parameter to refine the returned list of paths locally.

Always be thorough but concise. Focus on practical insights that developers can use.`
      );

      // We still fall back to runTextWithModel to reuse the provider/gateway logic in BaseAgent
      // but conceptually we'd route this via honidev logic eventually.
      // For now, keep the robust execution:
      const plan = await this.runTextWithModel({
        name: "ResearchAgent",
        model: getAgentModelName('ResearchAgent'),
        instructions: "You are a senior research analyst specializing in GitHub repository analysis.",
        prompt: messageText,
        tools: [this.getSearchTool()],
      });

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

/**
 * Callback for background workflows to report progress or final findings.
 */
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

  private getSearchTool() {
     return {
      type: 'function' as const,
      name: "search_github_code",
      description: "Search for code in GitHub repositories using GitHub's specialized search syntax. Using 'invok' signature for @openai/agents compatibility.",
      parameters: {
        type: "object" as const,
        properties: {
          query: { 
            type: "string" as const, 
            description: "The search query. Supports qualifiers like `org:cloudflare`, `repo:owner/name`, `filename:config.json`, `extension:ts`. Regex is NOT supported directly, but you can search for exact strings." 
          },
          regex_filter: { 
            type: "string" as const, 
            description: "Optional JS-compatible regex string to filter the search results locally (e.g., `^src/.*.ts$`). Application happens after fetching results." 
          },
          max_results: { 
            type: "number" as const, 
            description: "Maximum number of results to return (default: 10)." 
          }
        },
        required: ["query"],
        additionalProperties: false
      },
      strict: true,
      isEnabled: async () => true, 
      needsApproval: async () => false,
      invoke: async (context: any, input: string) => {
        try {
          const args = JSON.parse(input);
          const octokit = await getOctokit(this.env);
          
          // 1. Pre-process query
          const finalQuery = args.query;
          
          // 2. Perform Search
          try {
            const { data } = await octokit.search.code({
              q: finalQuery,
              per_page: Math.min(args.max_results || 10, 100), // Cap at 100
            });

            let items = data.items.map((item: any) => ({
              name: item.name,
              path: item.path,
              repository: item.repository.full_name,
              html_url: item.html_url,
              score: item.score
            }));

            // 3. Post-Process matching (Regex Filter)
            if (args.regex_filter) {
              try {
                const regex = new RegExp(args.regex_filter);
                items = items.filter((item: any) => regex.test(item.path));
              } catch (e) {
                return JSON.stringify({ error: `Invalid regex provided: ${args.regex_filter}` });
              }
            }

            return JSON.stringify({
              total_count_raw: data.total_count,
              returned_count: items.length,
              items
            });
          } catch (err: any) {
            return JSON.stringify({ error: `GitHub Search failed: ${err.message}` });
          }
        } catch (parseError: any) {
          return JSON.stringify({ error: `Failed to parse tool input: ${parseError.message}` });
        }
      }
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
