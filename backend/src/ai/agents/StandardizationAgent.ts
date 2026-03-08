import { BaseAgent, BaseAgentState } from "./base/BaseAgent";
import { makeQueryStandardsTool } from "@/ai/tools/standards";
import { z } from "zod";

type StandardizationState = BaseAgentState;

export class StandardizationAgent extends BaseAgent<Env, StandardizationState> {
  protected get agentName(): string {
    return "StandardizationAgent";
  }

  /**
   * Evaluates the active repository standards and prepares an explicit prompt
   * for a downstream coding agent (e.g. Jules) to apply fixes to a PR.
   */
  async runAnalysis(
    prContext: string,
    issueNumber: number,
    owner: string,
    repo: string
  ): Promise<string> {
    const prompt = `You are a strict codebase standardization expert.
Analyze the following Pull Request / Issue Context:
---
${prContext}
---
Decide which standards apply to the changes in this PR.
Query the active repository standards and retrieve their descriptions to ensure absolute correctness.
Formulate a highly specific implementation prompt for an AI coding assistant (like Jules) that will explicitly instruct it on how to fix the discrepancies in this PR.

Your response should ONLY be the final prompt that will be fed to Jules.`;

    const tools = [
      makeQueryStandardsTool((this.env as any)),
      {
        name: "search_cloudflare_documentation",
        description: "Search Cloudflare docs to ground best practices. Use only if Cloudflare platform specific questions arise.",
        parameters: z.object({ query: z.string() }),
        execute: async (args: any) => {
           // Leverage the existing queryMCP from mcp-client dynamically
           const { queryMCP } = await import("@/ai/mcp/mcp-client");
           const result = await queryMCP(args.query, "StandardizationAgent");
           return typeof result === "string" ? result : JSON.stringify(result);
        }
      }
    ];

    try {
      this.setStatus("running");
      const result = await this.runTextWithModel({
        name: this.agentName,
        instructions: "You are the primary Standardization orchestrator. Use tools strictly when necessary.",
        prompt,
        tools: tools as any[]
      });
      this.setStatus("completed");
      return result;
    } catch (e) {
      this.logger.error(`StandardizationAgent failed for issue #${issueNumber}`, { error: e });
      this.setStatus("failed");
      throw e;
    }
  }
}
