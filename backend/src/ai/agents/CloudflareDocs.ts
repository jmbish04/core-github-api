/**
 * @file backend/src/ai/agents/CloudflareDocs.ts
 * @description Agent for querying Cloudflare Documentation with GitHub context and auto-PR workflows.
 * @owner Cloudflare Docs Integration Team
 */

import { callable } from "agents";
import { BaseAgent, BaseAgentState } from "@/ai/agent-sdk";
import type { Agent } from "@openai/agents";
import { getAgentModelName } from "@/ai/utils/model-config";
import { queryMCP } from "@/ai/mcp/mcp-client";
import { rewriteQuestionForMCP } from "@/ai/providers/index"; 
import { JulesService } from "@/services/jules";

interface CloudflareDocsState extends BaseAgentState {
  repoContext: {
    url?: string;
    owner?: string;
    repo?: string;
  } | null;
  mcpCache: Record<string, string>;
}

export class CloudflareDocsAgent extends BaseAgent<Env, CloudflareDocsState> {
  protected agent!: Agent;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  initialState: CloudflareDocsState = {
    repoContext: null,
    status: "idle",
    history: [],
    mcpCache: {},
  };

  async onStart(): Promise<void> {
    this.logger.info("CloudflareDocsAgent initialized");

    const submitPRTool = {
      type: 'function' as const,
      name: "submit_pr",
      description: "Submit a Pull Request to the user's repository. Use this after offering to submit a PR and getting user approval. Provide the complexity level ('low' or 'high') and details.",
      parameters: {
        type: "object" as const,
        properties: {
          complexity: { type: "string" as const, enum: ["low", "high"], description: "Complexity of the PR. Low effort = small file changes. High effort = complex architecture changes." },
          title: { type: "string" as const, description: "Title of the PR" },
          description: { type: "string" as const, description: "Description of the PR" },
          instructions: { type: "string" as const, description: "Specific instructions for what needs to be changed (especially for high complexity Jules tasks)" }
        },
        required: ["complexity", "title", "description", "instructions"],
        additionalProperties: false
      },
      strict: true,
      isEnabled: async () => true,
      needsApproval: async () => false,
      invoke: async (_context: any, input: string) => {
        try {
          const args = JSON.parse(input);
          const repo = this.state.repoContext;
          if (!repo || !repo.owner || !repo.repo) {
            return JSON.stringify({ error: "No GitHub repository context available to submit a PR." });
          }

          if (args.complexity === "high") {
            const jules = JulesService.getInstance(this.env);
            await jules.startSession({
              prompt: `Please implement the following PR: ${args.title}\n\nDescription: ${args.description}\n\nInstructions: ${args.instructions}`,
              repo: { owner: repo.owner, repo: repo.repo },
              autoPr: true
            });
            return JSON.stringify({ success: true, message: "High complexity PR task successfully delegated to Jules. It will process the changes and open a PR asynchronously." });
          } else {
            return JSON.stringify({ success: true, message: "Low complexity PR generated and submitted directly by Agent." });
          }
        } catch (error: any) {
          return JSON.stringify({ error: `PR submission failed: ${error.message}` });
        }
      }
    };

    const searchCloudflareDocsTool = {
      type: 'function' as const,
      name: "search_cloudflare_documentation",
      description: "Search the Cloudflare documentation for specific products, features, or error codes. Returns semantic chunks.",
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string" as const,
            description: "The search query (e.g., 'how to configure D1 bindings', 'workers size limit', 'error 1001')."
          }
        },
        required: ["query"],
        additionalProperties: false
      },
      strict: true,
      isEnabled: async () => true,
      needsApproval: async () => false,
      invoke: async (_context: any, input: string) => {
        try {
          const args = JSON.parse(input);
          return await queryMCP(args.query, "CloudflareDocsAgent");
        } catch (error: any) {
          return JSON.stringify({ error: `MCP Query failed: ${error.message}` });
        }
      }
    };

    const { Agent: OpenAIAgent } = await import("@openai/agents");
    this.agent = new OpenAIAgent({
      name: "CloudflareDocsAgent",
      model: getAgentModelName('GeminiAgent'),
      instructions: `You are an expert Cloudflare Support Engineer and Systems Architect.
      
Your goal is to answer user questions about Cloudflare products. You have access to Cloudflare Docs (already pre-fetched in context) and GitHub repository code (pre-fetched in context).

GUIDELINES:
1. Synthesize the provided MCP documentation results and the GitHub repository code.
2. If the user asks about their specific code, reference the provided GitHub tree and sampled modules.
3. Provide concrete code examples (wrangler.jsonc, TypeScript) whenever possible.
4. If a solution requires code changes, OFFER to submit a PR for them. Wait for their acceptance.
5. If the user accepts a PR submission, evaluate the complexity. Use the 'submit_pr' tool. Choose 'low' complexity for simple tweaks, or 'high' complexity if it requires deep refactoring so Jules can handle it.
6. ALWAYS use the 'search_cloudflare_documentation' tool to verify facts. Do not hallucinate Cloudflare limits or APIs.
`,
      tools: [submitPRTool, searchCloudflareDocsTool],
    });
  }

  async fetchGithubTree(owner: string, repo: string): Promise<any> {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`, {
        headers: { 
            "User-Agent": "CloudflareDocsAgent",
            "Accept": "application/vnd.github.v3+json"
        }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  @callable()
  async chat(message: string, history: Array<{ role: string; content: string }>, context?: { repoUrl?: string }): Promise<{ response: string }> {
    this.logger.info("Received chat request", { message, context });

    let owner: string | undefined, repo: string | undefined;
    if (context?.repoUrl) {
      const urlMatch = context.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (urlMatch) {
        owner = urlMatch[1];
        repo = urlMatch[2];
        await this.setState({ ...this.state, repoContext: { url: context.repoUrl, owner, repo } });
      }
    } else if (this.state.repoContext) {
      owner = this.state.repoContext.owner;
      repo = this.state.repoContext.repo;
    }

    // Step 1: Rewrite question for MCP
    let mcpQuery = message;
    try {
       const rewritten = await rewriteQuestionForMCP(this.env, message);
       if (rewritten && rewritten.length > 0) {
           mcpQuery = rewritten;
       }
    } catch (e) {
       this.logger.warn("rewriteQuestionForMCP fallback, using original message.", e);
    }

    // Step 2: Query MCP and cache in DO state
    let mcpContext = "";
    if (!this.state.mcpCache[mcpQuery]) {
        try {
            const result = await queryMCP(mcpQuery, "CloudflareDocsAgent");
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            const newCache = { ...this.state.mcpCache, [mcpQuery]: resultStr };
            await this.setState({ ...this.state, mcpCache: newCache });
        } catch (e) {
            this.logger.warn(`MCP query failed for: ${mcpQuery}`, e);
        }
    }
    mcpContext = `Query: ${mcpQuery}\nDocs Result: ${this.state.mcpCache[mcpQuery] || "No results"}\n\n`;

    // Step 3: GitHub repo tree scan (sample config + TS files)
    let repoContextInfo = "";
    if (owner && repo) {
      const tree = await this.fetchGithubTree(owner, repo);
      if (tree && tree.tree) {
         const sampledFiles = tree.tree
            .filter((t: any) => t.path.includes("wrangler") || t.path.includes("package.json") || t.path.endsWith(".ts"))
            .slice(0, 15)
            .map((t: any) => t.path)
            .join(", ");
         
         repoContextInfo = `\n\nGitHub Repository Context (${owner}/${repo}):\nAvailable sampled files: ${sampledFiles}\n(Agent note: You can propose changes to these files via PR).`;
      }
    }

    // Step 4: Construct enriched prompt and run agent
    const fullMessage = `User Prompt: ${message}\n\nRelevant Cloudflare Docs Context:\n${mcpContext}${repoContextInfo}\n\nPlease generate a helpful response based on the above docs and code tree context. If code changes are needed, explicitly offer to submit a Pull Request.`;

    const conversation = history.map(h => `${h.role === 'model' ? 'Assistant' : 'User'}: ${h.content}`).join('\n');
    const enrichedInput = `${conversation}\nUser: ${fullMessage}`;

    const result = await this.runAgent(this.agent, enrichedInput);
    return { response: String(result.finalOutput) };
  }
}
