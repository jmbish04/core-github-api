/**
 * @file backend/src/services/build-failure-analyzer.ts
 * @description Service to fetch Cloudflare Workers build/deployment logs and
 *              analyze failures using Worker AI to produce agent-targeted fix prompts.
 */

import { generateText } from "@/ai/providers";

/**
 * Fetch deployment logs from the Cloudflare API.
 * Uses the Workers tail/log endpoint or the deployments API.
 */
export async function fetchBuildLogs(
  env: Env,
  scriptName: string,
): Promise<string | null> {
  try {
    const accountId =
      typeof env.CLOUDFLARE_ACCOUNT_ID === "string"
        ? env.CLOUDFLARE_ACCOUNT_ID
        : await (env.CLOUDFLARE_ACCOUNT_ID as any).get();
    const apiToken =
      typeof env.CLOUDFLARE_API_TOKEN === "string"
        ? env.CLOUDFLARE_API_TOKEN
        : await (env.CLOUDFLARE_API_TOKEN as any).get();

    if (!accountId || !apiToken) {
      console.error(
        "[BuildFailureAnalyzer] Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN"
      );
      return null;
    }

    // Fetch the most recent deployment for this worker
    const deploymentsRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/deployments`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!deploymentsRes.ok) {
      console.error(
        `[BuildFailureAnalyzer] Failed to fetch deployments: ${deploymentsRes.status}`
      );
      return null;
    }

    const deploymentsData = (await deploymentsRes.json()) as any;
    const deployments = deploymentsData?.result?.deployments || deploymentsData?.result || [];

    if (!Array.isArray(deployments) || deployments.length === 0) {
      return "No deployments found for this worker.";
    }

    // Get the latest deployment details
    const latest = deployments[0];
    const deploymentId = latest.id;

    // Try to fetch tail logs (last errors)
    const tailRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/tails`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filters: [{ status: ["error"] }],
        }),
      }
    );

    // If tail API doesn't give useful info, return deployment metadata
    let logOutput = `Deployment ID: ${deploymentId}\n`;
    logOutput += `Created: ${latest.created_on || "unknown"}\n`;

    if (latest.source?.type) {
      logOutput += `Source: ${latest.source.type}\n`;
    }

    if (latest.annotations) {
      logOutput += `Annotations:\n`;
      for (const [key, value] of Object.entries(latest.annotations)) {
        logOutput += `  ${key}: ${value}\n`;
      }
    }

    // If there's a build error message in the deployment
    if (latest.build_error || latest.error) {
      logOutput +=
        `\nBuild Error:\n${latest.build_error || latest.error}\n`;
    }

    return logOutput;
  } catch (error) {
    console.error("[BuildFailureAnalyzer] Error fetching build logs:", error);
    return null;
  }
}

/**
 * Infer the Cloudflare Worker script name from a GitHub repo full_name.
 * Convention: repo name is typically the worker name.
 */
export function inferWorkerName(repoFullName: string): string {
  // Extract repo name from "owner/repo" 
  const parts = repoFullName.split("/");
  return parts[parts.length - 1] || repoFullName;
}

export interface BuildAnalysis {
  analysis: string;
  fixPrompt: string;
  relevantLogs: string;
}

/**
 * Analyze build failure logs using Worker AI and generate a fix prompt
 * targeted at the coding agent that submitted the PR.
 */
export async function analyzeBuildFailure(
  env: Env,
  logs: string,
  prContext: {
    prNumber: number;
    prTitle: string;
    headRef: string;
    repoFullName: string;
  }
): Promise<BuildAnalysis> {
  const systemPrompt = `You are a Cloudflare Workers build failure analyst. 
Analyze the provided build/deployment logs and:
1. Identify the root cause of the failure
2. Generate a concise, actionable fix prompt that a coding agent can follow
3. Extract the most relevant log lines

Keep the fix prompt specific and technical. Reference exact file paths and error messages.
Do NOT include pleasantries or explanations — just the fix instructions.`;

  const prompt = `PR #${prContext.prNumber}: "${prContext.prTitle}"
Branch: ${prContext.headRef}
Repository: ${prContext.repoFullName}

Build/Deployment Logs:
${logs}

Generate:
1. A one-paragraph analysis of why the build failed
2. A fix prompt for the coding agent (imperative instructions only)
3. The 10 most relevant log lines`;

  try {
    const result = await generateText(env, prompt, systemPrompt, {
      maxTokens: 1500,
    });

    // Parse the result into sections
    const sections = result.split("\n\n");
    const analysis = sections[0] || "Build failure detected.";
    const fixPrompt =
      sections[1] || "Review the build logs and fix the compilation errors.";
    const relevantLogs =
      sections.slice(2).join("\n\n") || logs.slice(0, 2000);

    return { analysis, fixPrompt, relevantLogs };
  } catch (error) {
    console.error("[BuildFailureAnalyzer] AI analysis failed:", error);
    return {
      analysis: "Build failure detected but AI analysis unavailable.",
      fixPrompt:
        "Review the build logs below and fix the compilation/deployment errors.",
      relevantLogs: logs.slice(0, 3000),
    };
  }
}

/**
 * Format a build failure comment for posting on a PR.
 */
export function formatBuildFailureComment(
  agentTag: string,
  prNumber: number,
  analysis: BuildAnalysis
): string {
  return `${agentTag} the worker failed to build on PR #${prNumber}.

**Analysis:** ${analysis.analysis}

**Fix Instructions:**
${analysis.fixPrompt}

<details>
<summary>Relevant Build Logs</summary>

\`\`\`
${analysis.relevantLogs}
\`\`\`

</details>`;
}
