/**
 * ============================================================================
 * CI HEALER — BUILD FAILURE ANALYZER
 * ============================================================================
 *
 * @file    src/backend/src/automations/pr/build-analyzer/analysis.ts
 * @module  build-analyzer
 *
 * PURPOSE:
 *   This module is the core intelligence behind the "CI Healer" automation.
 *   It fetches Cloudflare Workers deployment logs and analyzes them using
 *   Workers AI to produce agent-targeted fix prompts.
 *
 * ⚠️  CRITICAL: FAILURE-ONLY TRIGGER MODEL ⚠️
 * ─────────────────────────────────────────────────────────────────────────────
 *   This module is NEVER invoked on successful builds. It is called
 *   exclusively when a GitHub `check_run` webhook arrives with:
 *
 *     eventName === "check_run"
 *     action    === "completed"
 *     conclusion === "failure"          ← THIS IS THE GATE
 *
 *   The trigger lives in `src/backend/src/routes/api/webhooks/index.ts`
 *   inside the "CI Healer" block (search for `[CI-Healer]`).
 *
 *   Flow:
 *     1. GitHub fires a `check_run.completed` webhook with `conclusion: "failure"`
 *     2. The webhook handler extracts: repo owner, repo name, branch, check name
 *     3. The handler calls `inferWorkerName(repoFullName)` to derive the
 *        Cloudflare Worker script name from the GitHub repo name
 *     4. `fetchBuildLogs(env, scriptName)` hits the Cloudflare Deployments API
 *        to pull the latest deployment metadata + tail logs
 *     5. `analyzeBuildFailure(env, logs, prContext)` runs:
 *        a. A regex-based "Sentinel Guardrail" pre-scan for known AI-agent
 *           failure patterns (lockfile desync, missing DO exports, etc.)
 *        b. An LLM call via Workers AI to produce a concise, imperative
 *           fix prompt targeted at the coding agent
 *     6. The resulting fix prompt is dispatched to Jules (or posted as a
 *        PR comment) so the coding agent can self-heal
 *
 * HOW WE MAP A GITHUB CHECK FAILURE → CLOUDFLARE BUILD LOGS:
 * ─────────────────────────────────────────────────────────────────────────────
 *   GitHub `check_run` payloads include `repository.name` (e.g. "my-worker").
 *   By convention, the Cloudflare Worker `script_name` (the `name` field in
 *   `wrangler.jsonc`) matches the GitHub repository name. This convention
 *   is handled by `WranglerInspectorService`.
 *
 *   With the script name in hand, we call:
 *     GET /accounts/{account_id}/workers/scripts/{script_name}/deployments
 *   to fetch the most recent deployment record, which includes:
 *     - `id` (deployment UUID)
 *     - `created_on` timestamp
 *     - `source.type` (e.g. "api", "dash")
 *     - `annotations` (commit SHA, branch, author)
 *     - `build_error` / `error` (if the deploy itself failed)
 *
 *   We also attempt a Tail log session via:
 *     POST /accounts/{account_id}/workers/scripts/{script_name}/tails
 *   with `filters: [{ status: ["error"] }]` to capture runtime error traces
 *   that may not appear in the deployment metadata.
 *
 * SENTINEL GUARDRAIL PRE-SCAN:
 * ─────────────────────────────────────────────────────────────────────────────
 *   Before invoking the LLM, this module scans the raw log text against a
 *   curated list of regex patterns representing the most common failure modes
 *   produced by AI coding agents. If matches are found, they are injected
 *   into the LLM prompt as high-priority alerts, forcing the model to center
 *   its analysis on the actual root cause rather than hallucinating unrelated
 *   fixes.
 *
 *   The known patterns are derived from retrospective analysis of real
 *   AI-agent coding sessions (Gemini, Claude, Cursor). See the
 *   `knownPatterns` array in `analyzeBuildFailure()` for the full list.
 *
 *   To add new patterns: append to the `knownPatterns` array. Each entry
 *   needs a human-readable `name` and a case-insensitive `regex`.
 *
 * CALLERS:
 *   1. `src/backend/src/routes/api/webhooks/index.ts` — CI Healer block
 *      (automatic, failure-only, via GitHub webhook)
 *   2. `src/backend/src/routes/api/frontend/repos/actions.ts` — Manual
 *      build log analysis triggered from the frontend dashboard
 *
 * ============================================================================
 */

import { AIProvider } from "@/ai/providers";
import { Octokit } from "octokit";
import { WranglerInspectorService } from "@/services/github/wrangler-inspector";
import { Logger } from "@/lib/logger";
import { getSecret } from "@utils/secrets";

/**
 * Fetch deployment logs from the Cloudflare API for a given Worker script.
 *
 * This function performs TWO Cloudflare API calls:
 *
 * 1. **Deployments API** — Retrieves the most recent deployment record for
 *    the specified Worker. This includes metadata like deployment ID,
 *    timestamps, source annotations (commit SHA, branch), and critically
 *    any `build_error` or `error` fields that indicate a failed deploy.
 *
 *    Endpoint: GET /accounts/{account_id}/workers/scripts/{scriptName}/deployments
 *
 * 2. **Tail Logs API** — Opens a short-lived tail session filtered to
 *    `status: "error"` to capture runtime exceptions and stack traces
 *    that may not be present in the deployment metadata itself.
 *
 *    Endpoint: POST /accounts/{account_id}/workers/scripts/{scriptName}/tails
 *
 * Authentication:
 *   Uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_WRANGLER_API_TOKEN` from the
 *   Worker environment. These may be plain strings or Cloudflare Secrets
 *   (which expose a `.get()` method), so both access patterns are handled.
 *
 * @param env        - The Worker environment bindings (must include
 *                     CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_WRANGLER_API_TOKEN)
 * @param scriptName - The Cloudflare Worker script name. By convention this
 *                     matches the GitHub repository name (see `inferWorkerName`)
 *
 * @returns A formatted string containing deployment metadata + tail logs,
 *          or `null` if the API calls fail. Returns a descriptive message
 *          if no deployments exist for the script.
 */
export interface FetchBuildLogsResult {
  isSuccess: boolean;
  errorMessage: string;
  errorObject?: any;
  logs: string;
}

export async function fetchBuildLogs(
  env: Env,
  scriptName: string,
): Promise<FetchBuildLogsResult> {
  const logger = new Logger(env, "BuildFailureAnalyzer");

  try {
    // ── Resolve credentials ──────────────────────────────────────────────
    // Cloudflare Secrets use a `.get()` accessor; plain env vars are strings.
    const accountId = getSecret(env, "CLOUDFLARE_ACCOUNT_ID");
    const apiToken = getSecret(env, "CLOUDFLARE_WRANGLER_API_TOKEN");

    if (!accountId || !apiToken) {
      const msg = "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_WRANGLER_API_TOKEN";
      logger.error(`[BuildFailureAnalyzer] ${msg}`);
      return { isSuccess: false, errorMessage: msg, logs: "" };
    }

    // ── Step 1: Fetch the most recent deployment for this worker ─────────
    // The Cloudflare Deployments API returns an array of deployment records
    // sorted by recency. We only care about the latest one (index 0).
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
      const msg = `Failed to fetch deployments: ${deploymentsRes.status} ${deploymentsRes.statusText}`;
      const errObj = await deploymentsRes.text().catch(() => null);
      logger.error(`[BuildFailureAnalyzer] ${msg}`, errObj);
      return { isSuccess: false, errorMessage: msg, errorObject: errObj, logs: "" };
    }

    const deploymentsData = (await deploymentsRes.json()) as any;
    const deployments = deploymentsData?.result?.deployments || deploymentsData?.result || [];

    if (!Array.isArray(deployments) || deployments.length === 0) {
      return { 
        isSuccess: false, 
        errorMessage: "No deployments found for this worker.", 
        logs: "No deployments found for this worker." 
      };
    }

    // ── Step 2: Extract deployment metadata ──────────────────────────────
    const latest = deployments[0];
    const deploymentId = latest.id;

    // ── Step 3: Fetch tail logs filtered to errors ───────────────────────
    // The Tail API creates a short-lived WebSocket-like session. Here we
    // POST with error filters to get the most recent error traces.
    // This is a best-effort call — if it fails we still have deployment
    // metadata to work with.
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

    let tailLogs = "";
    if (tailRes.ok) {
      try {
        const tailData = await tailRes.json() as any;
        if (tailData?.result) {
          tailLogs = JSON.stringify(tailData.result, null, 2);
        }
      } catch (e) {
        logger.error("[BuildFailureAnalyzer] Failed to parse tail response", e);
      }
    }

    // ── Step 4: Assemble the log output string ───────────────────────────
    // This string is what gets passed to the LLM for analysis.
    let logOutput = `Deployment ID: ${deploymentId}\n`;
    logOutput += `Created: ${latest.created_on || "unknown"}\n`;

    if (latest.source?.type) {
      logOutput += `Source: ${latest.source.type}\n`;
    }

    // Annotations typically contain: commit SHA, branch, author email
    if (latest.annotations) {
      logOutput += `Annotations:\n`;
      for (const [key, value] of Object.entries(latest.annotations)) {
        logOutput += `  ${key}: ${value}\n`;
      }
    }

    // The `build_error` or `error` field is the most valuable signal —
    // it contains the actual compilation or bundling failure message.
    if (latest.build_error || latest.error) {
      logOutput +=
        `\nBuild Error:\n${latest.build_error || latest.error}\n`;
    }

    // Append tail logs for runtime error context
    if (tailLogs) {
      logOutput += `\nTail Logs/Context:\n${tailLogs}\n`;
    }

    return { isSuccess: true, errorMessage: "", logs: logOutput };
  } catch (error) {
    logger.error("[BuildFailureAnalyzer] Error fetching build logs:", error);
    return { isSuccess: false, errorMessage: "Exception fetching build logs", errorObject: error, logs: "" };
  }
}


/**
 * Shape of the build analysis result returned by `analyzeBuildFailure()`.
 *
 * @property analysis     - Human-readable paragraph explaining the root cause
 * @property fixPrompt    - Imperative instructions for a coding agent to fix
 *                          the failure (no pleasantries, direct commands only)
 * @property relevantLogs - The 10 most relevant log lines extracted by the LLM
 */
export interface BuildAnalysis {
  analysis: string;
  fixPrompt: string;
  relevantLogs: string;
}

/**
 * Analyze build failure logs using Workers AI and generate a fix prompt
 * targeted at the coding agent that submitted the PR.
 *
 * This function is the brain of the CI Healer. It does two things:
 *
 * 1. **Sentinel Guardrail Pre-Scan** (regex, no LLM cost):
 *    Checks the raw logs against `knownPatterns` — a curated list of the
 *    most common failure modes produced by AI coding agents. These were
 *    identified through retrospective analysis of real Gemini/Claude
 *    coding sessions. If matches are found, they are injected into the
 *    LLM prompt as high-priority `🚨 ALERT` directives, drastically
 *    reducing hallucinated fixes.
 *
 *    Current known patterns:
 *    - Lockfile Desynchronization (agent modified package.json without
 *      running `pnpm install`, causing `--frozen-lockfile` CI failures)
 *    - Durable Object Export Omission (agent added a DO class but forgot
 *      to register it in `wrangler.jsonc` or re-export from the entrypoint)
 *    - Invalid Binding ID / Misspelling (agent referenced a D1/KV/R2
 *      binding name that doesn't exist in `wrangler.jsonc`)
 *    - Node Built-in Missing Prefix (agent imported `crypto` instead of
 *      `node:crypto`, causing esbuild resolution failures)
 *    - Entry File Missing / Disconnected (agent deleted or moved the
 *      entrypoint file without updating `wrangler.jsonc`)
 *
 * 2. **LLM Analysis** (Workers AI):
 *    Sends the logs + pre-scan alerts to the AI with a system prompt
 *    that enforces imperative, agent-friendly output. The model produces:
 *    - A one-paragraph root cause analysis
 *    - A fix prompt (imperative instructions only, no pleasantries)
 *    - The 10 most relevant log lines
 *
 * ⚠️  REMINDER: This function is ONLY called when a build has FAILED.
 *    It is never invoked for successful deployments. The gate is in the
 *    webhook handler (see module-level docstring above).
 *
 * @param env       - Worker environment bindings (needs AI provider access)
 * @param logs      - Raw build/deployment logs from `fetchBuildLogs()`
 * @param prContext - Metadata about the PR/branch that triggered the build
 *
 * @returns A `BuildAnalysis` object with analysis, fix prompt, and relevant logs
 */
export async function analyzeBuildFailure(
  env: Env,
  prContext: {
    prNumber: number;
    prTitle: string;
    headRef: string;
    repoFullName: string;
  }
): Promise<BuildAnalysis> {
  const logger = new Logger(env, "analyzeBuildFailure");
  const [owner, repo] = prContext.repoFullName.split("/");

  let scriptName = repo;
  try {
    const octokit = new Octokit({ auth: await getSecret(env, "GITHUB_PERSONAL_ACCESS_TOKEN") });
    const inspector = new WranglerInspectorService(octokit as any);
    scriptName = await inspector.getWorkerName(owner, repo);
    logger.info(`Resolved scriptName for ${prContext.repoFullName}: ${scriptName}`);  
  } catch (error) {
    logger.error(`Failed to resolve scriptName from wrangler config for ${prContext.repoFullName}. Falling back to repo name: ${repo}`, { error });
  }

  const buildLogsResult = await fetchBuildLogs(env, scriptName);
  const logs = buildLogsResult.logs;

  const systemPrompt = `You are a Cloudflare Workers build failure analyst. 
Analyze the provided build/deployment logs and:
1. Identify the root cause of the failure
2. Generate a concise, actionable fix prompt that a coding agent can follow
3. Extract the most relevant log lines

Keep the fix prompt specific and technical. Reference exact file paths and error messages.
Do NOT include pleasantries or explanations — just the fix instructions.`;

  // ── Sentinel Guardrail Pre-Scan ──────────────────────────────────────
  // These patterns were derived from retrospective analysis of real
  // AI-agent coding sessions. Each pattern represents a common failure
  // mode that AI agents produce when modifying Cloudflare Worker projects.
  //
  // To add a new pattern:
  //   1. Identify the exact error string from a build log
  //   2. Create a case-insensitive regex that matches it
  //   3. Give it a descriptive `name` that explains the root cause
  //   4. Append it to this array
  //
  // The matched patterns are injected into the LLM prompt as mandatory
  // focus areas, preventing the model from hallucinating unrelated fixes.
  const knownPatterns = [
    { name: "Lockfile Desynchronization (Missing or outdated packages)", regex: /(ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY|npm ERR! code ERESOLVE|npm ERR! cb\(\) never called)/i },
    { name: "Durable Object Export Omission", regex: /Durable Object class .* not found/i },
    { name: "Invalid Binding ID / Misspelling", regex: /(Binding name .* is invalid|Cannot find binding)/i },
    { name: "Node Built-in Missing Prefix (Esbuild error)", regex: /Could not resolve "(crypto|buffer|stream|path|fs)"/i },
    { name: "Entry File Missing / Disconnected", regex: /Could not resolve ".*index\.ts"/i }
  ];

  const matchedPatterns: string[] = [];
  for (const pattern of knownPatterns) {
    if (pattern.regex.test(logs)) {
      matchedPatterns.push(pattern.name);
    }
  }

  let patternContext = "";
  if (matchedPatterns.length > 0) {
    patternContext = `\n**🚨 ALERT: Sentinel Guardrails detected the following known failure patterns in these logs:**\n- ${matchedPatterns.join('\n- ')}\n\nYou MUST center your analysis and fix instructions around these specific root causes.`;
  }

  const noLogs = !buildLogsResult.isSuccess;
  const generateInstructions = noLogs
    ? `Generate:
1. A one-paragraph analysis of why the build failed or was not triggered properly (since there are no logs).
2. A fix prompt for the coding agent (imperative instructions only)`
    : `Generate:
1. A one-paragraph analysis of why the build failed
2. A fix prompt for the coding agent (imperative instructions only)
3. The 10 most relevant log lines`;

  const prompt = `PR #${prContext.prNumber}: "${prContext.prTitle}"
Branch: ${prContext.headRef}
Repository: ${prContext.repoFullName}
${patternContext}

Build/Deployment Logs:
${logs || buildLogsResult.errorMessage}

${generateInstructions}`;

  try {
    const ai = new AIProvider(env);
    // Use Jules for build analysis (repoless session) to leverage 1M token context
    ai.provider = 'jules';
    const result = await ai.generateText(prompt, systemPrompt);

    // ── Parse the LLM result into structured sections ────────────────
    // The model is instructed to separate sections with double newlines.
    // Section 0 = analysis, Section 1 = fix prompt, Section 2+ = logs.
    const sections = result.split("\n\n");
    const analysis = sections[0] || "Build failure detected.";
    const fixPrompt =
      sections[1] || "Review the build logs and fix the compilation errors.";
    const relevantLogs =
      sections.slice(2).join("\n\n")

    return { analysis, fixPrompt, relevantLogs };
  } catch (error) {
    logger.error("[BuildFailureAnalyzer] AI analysis failed:", error);
    return {
      analysis: `Build failure detected but AI analysis unavailable. Note: ${buildLogsResult.errorMessage}`,
      fixPrompt:
        "Review the build logs below and fix the compilation/deployment errors.",
      relevantLogs: logs || buildLogsResult.errorMessage,
    };
  }
}

/**
 * Format a build failure analysis into a markdown comment for posting on a PR.
 *
 * This produces a structured GitHub comment with:
 *   - An agent tag (for @mentioning the responsible coding agent)
 *   - Critical deployment-flagged instructions (if any)
 *   - AI-generated log analysis
 *   - Cloudflare Docs context (if binding issues were detected)
 *   - Full raw build logs in a code block
 *   - A hidden HTML comment with the build UUID for traceability
 *
 * @param agentTag  - GitHub username to mention (e.g. "@gemini-code-assist")
 * @param prNumber  - PR number (used for reference, not currently in output)
 * @param analysis  - The structured analysis object from `analyzeBuildFailure()`
 *                    plus any additional instructions and docs context
 *
 * @returns A formatted markdown string ready to POST as a GitHub PR comment
 */
export function formatBuildFailureComment(
  agentTag: string,
  prNumber: number,
  analysis: {
    julesPrompt: string;
    instructions: string[];
    docsContent: string;
    rawLogs: string;
    buildUuid?: string;
  },
  env: Env
): string {
  const logger = new Logger(env, "formatBuildFailureComment");

  const repoOwner = env.GITHUB_OWNER;
  const isCommenterRepoOwner = agentTag.includes(repoOwner);

  logger.info(`[formatBuildFailureComment] agentTag: ${agentTag}, repoOwner: ${repoOwner}, isCommenterRepoOwner: ${isCommenterRepoOwner}`);
  let finalComment = `${!isCommenterRepoOwner ? agentTag + " " : ""}🚨 **Build Failed!** Here are your automated remediation instructions:\n\n`;

  if (analysis.instructions.length > 0) {
    logger.info(`[formatBuildFailureComment] Analysis.instructions.length (${analysis.instructions.length}) > 0: Adding critical deployment flagged instructions`);
    const criticalDeploymentFlaggedInstructions = `### ⚠️ Critical Deployment Flagged Instructions:\n${analysis.instructions.join("\n")}\n\n`;
    finalComment += criticalDeploymentFlaggedInstructions;
    logger.info(`[formatBuildFailureComment] Added critical deployment flagged instructions: ${criticalDeploymentFlaggedInstructions}`);
  }

  finalComment += `### 🧠 AI Log Analysis:\n${analysis.julesPrompt}\n\n`;
  logger.info(`[formatBuildFailureComment] Jules Prompt: ${analysis.julesPrompt}`);

  if (analysis.docsContent) {
    logger.info(`[formatBuildFailureComment] analysis.docsContent detected, adding to finalComment: ${analysis.docsContent}`);
    finalComment += `${analysis.docsContent}\n\n`;
  }

  const rawLogs = analysis.rawLogs.trim();
  const buildUuid = analysis.buildUuid || 'latest';
  logger.info(`[formatBuildFailureComment] rawLogs: ${rawLogs}`);
  logger.info(`[formatBuildFailureComment] buildUuid: ${buildUuid}`);
  finalComment += `### 📝 Full Build Logs:\n\`\`\`markdown\n${rawLogs}\n\`\`\`\n\n`;
  finalComment += `<!-- build-uuid: ${buildUuid} -->`;
  logger.info(`[formatBuildFailureComment] finalComment: ${finalComment}`);

  return finalComment;
}
