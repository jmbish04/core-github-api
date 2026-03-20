import { Env } from "@/types";
import { App } from "octokit";
import { withCompatOctokit } from "@/services/octokit/compat";
import { createSupervisorAgent, createCodeReviewAgent, createSummaryAgent } from "./agents";
import { chunkFiles } from "./utils/chunking";
import { filterFilesForReview } from "./utils/filter";
import { z } from "zod";
import { createRunner } from "@/ai/agents/base/agent-ai";

export async function orchestratePrReview(env: Env, payload: any, appId: string, privateKey: string) {
  const prNumber = payload.pull_request?.number;
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  const installationId = payload.installation?.id;

  if (!prNumber || !owner || !repo || !installationId) {
    console.warn("[PR Orchestrator] Missing required PR context payload fields.");
    return;
  }

  const octokitCtx = { appId, privateKey, installationId };
  const runner = await createRunner(env, "worker-ai");

  // 1. Supervisor Phase: Fetch and Filter Diffs
  const supervisor = createSupervisorAgent(env, octokitCtx);

  const supervisorPlanStr = await runner.run(supervisor, `Analyze PR #${prNumber} in ${owner}/${repo}. Call fetch_pr_diff to get the files. Decide if this PR needs review. Output a JSON plan with { shouldReview: boolean, reasoning: string, filesToReview: string[] }`) as any;

  let supervisorPlan;
  try {
    supervisorPlan = JSON.parse(supervisorPlanStr.finalOutput);
  } catch (e) {
    supervisorPlan = { shouldReview: true, reasoning: "Fallback", filesToReview: [] };
  }

  if (!supervisorPlan.shouldReview) {
    console.log(`[PR Orchestrator] Supervisor skipped review for PR #${prNumber}: ${supervisorPlan.reasoning}`);
    return;
  }

  // Fetch the full diff to get patches (Supervisor might not have passed it back directly)
  const app = new App({ appId, privateKey });
  const octokit = withCompatOctokit(await app.getInstallationOctokit(installationId));
  const { data: files } = await octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 });

  const filesToReview = filterFilesForReview(files).filter(f => supervisorPlan.filesToReview.length === 0 || supervisorPlan.filesToReview.includes(f.filename));
  const chunks = chunkFiles(filesToReview);

  // 2. Code Review Phase: Process Chunks
  const reviewer = createCodeReviewAgent(env, octokitCtx);
  const reviewFindings: any[] = [];

  for (const chunk of chunks) {
    const chunkResultStr = await runner.run(reviewer, `Review the following diff chunk for ${chunk.filename}:\n\n${chunk.content}\n\nCall create_review_comment if you find bugs or critical issues. Do not comment on nitpicks. Return JSON { commentsMade: number, issuesFound: string[] }`) as any;
    let chunkResult;
    try {
        chunkResult = JSON.parse(chunkResultStr.finalOutput || '{}');
    } catch(e) {
        chunkResult = { issuesFound: [] };
    }

    reviewFindings.push({ filename: chunk.filename, chunkId: chunk.chunkId, issues: chunkResult.issuesFound });
  }

  // 3. Summary Phase: Submit Final Review
  const summaryAgent = createSummaryAgent(env, octokitCtx);
  const totalIssues = reviewFindings.flatMap(f => f.issues).length;
  const finalEvent = totalIssues > 0 ? "REQUEST_CHANGES" : "APPROVE";

  await runner.run(summaryAgent, `Summarize the findings for PR #${prNumber} in ${owner}/${repo}. Total issues found: ${totalIssues}. Review findings: ${JSON.stringify(reviewFindings)}. Call submit_pr_review with event ${finalEvent} to finalize.`);

  console.log(`[PR Orchestrator] Completed review for PR #${prNumber}`);
}
