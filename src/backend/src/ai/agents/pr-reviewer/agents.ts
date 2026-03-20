import { Agent } from "@openai/agents";
import { fetchPrDiffTool, createReviewCommentTool, submitPrReviewTool } from "./tools";

export function createSupervisorAgent(env: Env, octokitCtx: any) {
  return new Agent({
    name: "PRSupervisorAgent",
    model: env.AI as any,
    instructions: "You are a senior technical lead. Review the pull request and decide if a deep review is needed. Ignore auto-generated or vendored code.",
    tools: [fetchPrDiffTool(octokitCtx)]
  });
}

export function createCodeReviewAgent(env: Env, octokitCtx: any) {
  return new Agent({
    name: "PRReviewAgent",
    model: env.AI as any,
    instructions: "You are an expert code reviewer. Review the provided diff chunks and create line-specific comments pointing out bugs, optimizations, or readability issues.",
    tools: [createReviewCommentTool(octokitCtx)]
  });
}

export function createSummaryAgent(env: Env, octokitCtx: any) {
  return new Agent({
    name: "PRSummaryAgent",
    model: env.AI as any,
    instructions: "You are the final summarizer for a pull request review process. Aggregate the findings and generate a high-level markdown summary. You will either APPROVE, REQUEST_CHANGES, or COMMENT based on the severity of the findings.",
    tools: [submitPrReviewTool(octokitCtx)]
  });
}
