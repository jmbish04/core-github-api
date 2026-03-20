import { tool } from "@openai/agents";
import { z } from "zod";
import { App } from "octokit";
import { withCompatOctokit } from "@/services/octokit/compat";

/**
 * Common configuration for Github Octokit interactions inside tools.
 */
interface OctokitContext {
  appId: string;
  privateKey: string;
  installationId: number;
}

const getOctokit = async (ctx: OctokitContext) => {
  const app = new App({
    appId: ctx.appId,
    privateKey: ctx.privateKey,
  });
  return withCompatOctokit(await app.getInstallationOctokit(ctx.installationId));
};

export const fetchPrDiffTool = (ctx: OctokitContext) => tool({
  name: "fetch_pr_diff",
  description: "Fetches the files and raw diff/patch for a specific pull request.",
  parameters: z.object({
    owner: z.string(),
    repo: z.string(),
    pullNumber: z.number(),
  }),
  execute: async (args: any) => {
    const octokit = await getOctokit(ctx);
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: args.owner,
      repo: args.repo,
      pull_number: args.pullNumber,
      per_page: 100
    });
    return files;
  }
});

export const createReviewCommentTool = (ctx: OctokitContext) => tool({
  name: "create_review_comment",
  description: "Creates a line-specific review comment on a pull request diff.",
  parameters: z.object({
    owner: z.string(),
    repo: z.string(),
    pullNumber: z.number(),
    commitId: z.string(),
    path: z.string(),
    line: z.number(),
    side: z.enum(["LEFT", "RIGHT"]).optional(),
    body: z.string().describe("The markdown content of the comment."),
  }),
  execute: async (args: any) => {
    const octokit = await getOctokit(ctx);
    const { data } = await octokit.rest.pulls.createReviewComment({
      owner: args.owner,
      repo: args.repo,
      pull_number: args.pullNumber,
      commit_id: args.commitId,
      path: args.path,
      line: args.line,
      side: args.side,
      body: args.body
    });
    return data;
  }
});

export const submitPrReviewTool = (ctx: OctokitContext) => tool({
  name: "submit_pr_review",
  description: "Submits the final summary review for a pull request.",
  parameters: z.object({
    owner: z.string(),
    repo: z.string(),
    pullNumber: z.number(),
    event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
    body: z.string().describe("The final markdown summary for the entire PR."),
  }),
  execute: async (args: any) => {
    const octokit = await getOctokit(ctx);
    const { data } = await octokit.rest.pulls.createReview({
      owner: args.owner,
      repo: args.repo,
      pull_number: args.pullNumber,
      event: args.event,
      body: args.body,
    });
    return data;
  }
});
