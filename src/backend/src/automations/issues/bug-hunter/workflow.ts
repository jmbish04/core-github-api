/**
 * @file backend/src/routes/api/webhooks/workflows/bug-hunter/index.ts
 * @description The Bug Hunter Workflow responder. Automatically detects newly opened 'bug' 
 *              issues, uses generative AI to parse the issue into formal steps, builds a minimal 
 *              reproduction framework testing file (Vitest) in a sandboxed runtime, and posts 
 *              results back intelligently onto the PR thread to assist developer workflows.
 *              Optimized for AI coding agents to dynamically triage unstructured bug reports.
 * @module bug-hunter
 */

import { z } from "zod";
import { generateStructuredResponse } from "@/ai/providers";
import { resolveDefaultAiModel, resolveDefaultAiProvider } from "@/ai/agents/support/agent-ai";
import { execInSandbox, writeSandboxFile, createGitHubApp, getInstallationToken, toShortLog } from "../../shared/sandbox";
import { shellEscape, sanitizeForPath } from "@/ai/mcp/tools/sandbox-sdk";

const BUG_CHECK_TIMEOUT_MS = 5 * 60 * 1000;

const ParsedIssueSchema = z.object({
  summary: z.string(),
  expectedBehavior: z.string().default("Not specified"),
  actualBehavior: z.string().default("Not specified"),
  reproductionSteps: z.array(z.string()).default([]),
  suspectedArea: z.string().default("Not specified"),
});

const GeneratedTestSchema = z.object({
  testCode: z.string(),
  testName: z.string(),
  notes: z.array(z.string()).default([]),
});

/**
 * Identifies if an inbound GitHub payload features a distinct 'bug' label attribute.
 * Filters extraneous operational issue events.
 * 
 * @param labels - Array of label data extracted from issue context.
 * @returns {boolean} A boolean true if matching tag definitions, else false.
 */
function hasBugLabel(labels: any[] = []): boolean {
  return labels.some((label) => {
    if (typeof label === "string") return label.toLowerCase() === "bug";
    return String(label?.name || "").toLowerCase() === "bug";
  });
}

/**
 * Triage boolean determination assessing if an incoming webhook action correlates
 * dynamically to starting a new Bug Hunter test case reproduction effort.
 * 
 * @param payload - Inbound serialized interaction state from the github payload event.
 * @returns {boolean} Whether or not this event qualifies.
 */
export function shouldRunBugHunter(payload: any): boolean {
  return payload?.action === "opened" && hasBugLabel(payload?.issue?.labels || []);
}

/**
 * Uses LLM models to transform informal human prose bug context into strict, schema-compliant
 * standardized technical representations that drive subsequent step synthesis loops.
 * 
 * @param env - Configured Worker env data exposing LLM backend connection states.
 * @param issueTitle - Name assigned to the bug occurrence.
 * @param issueBody - Natural language raw description provided by author.
 */
async function parseIssueWithGemini(env: Env, issueTitle: string, issueBody: string) {
  const provider = resolveDefaultAiProvider(env);
  const model = (env as any).BUG_HUNTER_MODEL || resolveDefaultAiModel(env, provider);
  
  const prompt = [
    "Parse this GitHub bug report into structured engineering notes.",
    "Keep each reproduction step concise and deterministic.",
    `Issue title: ${issueTitle}`,
    `Issue body:\n${issueBody || "(empty)"}`,
  ].join("\n\n");

  const { zodToJsonSchema } = await import("zod-to-json-schema");
  const result = await generateStructuredResponse<z.infer<typeof ParsedIssueSchema>>(
    env,
    prompt,
    zodToJsonSchema(ParsedIssueSchema as any, "bug_hunter_issue") as any,
    "Parse bug reports into concise, deterministic engineering notes. Return only structured JSON.",
    { model },
    provider,
  );
  
  return result;
}

/**
 * Synthesizes a valid TypeScript-based architectural `vitest` unit test that programmatically 
 * validates the buggy behavior parsed out by earlier conceptual evaluation cycles.
 * 
 * @param env - Connection interface referencing backing generative ML platform resources.
 * @param parsedIssue - Clean, strongly typed logical requirements definition outlining reproduction state.
 */
async function generateFailingVitest(env: Env, parsedIssue: z.infer<typeof ParsedIssueSchema>) {
  const provider = resolveDefaultAiProvider(env);
  const model = (env as any).BUG_HUNTER_MODEL || resolveDefaultAiModel(env, provider);
  
  const prompt = [
    "Write a single-file Vitest test that reproduces the bug.",
    "Return only valid TypeScript test code in `testCode`.",
    "The test should fail against current buggy behavior.",
    "Do not include markdown fences.",
    `Summary: ${parsedIssue.summary}`,
    `Expected: ${parsedIssue.expectedBehavior}`,
    `Actual: ${parsedIssue.actualBehavior}`,
    `Suspected area: ${parsedIssue.suspectedArea}`,
    `Reproduction steps: ${parsedIssue.reproductionSteps.join(" | ")}`,
  ].join("\n\n");

  const { zodToJsonSchema } = await import("zod-to-json-schema");
  const result = await generateStructuredResponse<z.infer<typeof GeneratedTestSchema>>(
    env,
    prompt,
    zodToJsonSchema(GeneratedTestSchema as any, "bug_hunter_test") as any,
    "Generate a single-file failing Vitest reproduction test. Return only structured JSON with valid TypeScript in testCode.",
    { model },
    provider,
  );
  
  return result;
}

/**
 * Primary autonomous entrypoint orchestrating complete end-to-end Bug Hunter operation.
 * Binds sequential operations: interpretation parser -> test script generator -> ephemeral remote sandbox validation container -> repository user commentary feedback loops.
 * 
 * @param params - Execution container options including bound environments and GitHub origin payloads.
 */
export async function runBugHunterWorkflow(params: {
  env: Env;
  payload: any;
  deliveryId: string;
}): Promise<void> {
  const { env, payload, deliveryId } = params;

  const owner = payload?.repository?.owner?.login;
  const repo = payload?.repository?.name;
  const issueNumber = payload?.issue?.number;
  const installationId = payload?.installation?.id;

  if (!owner || !repo || !issueNumber || !installationId) {
    console.warn("[BugHunter] Missing required payload fields.");
    return;
  }

  const app = await createGitHubApp(env);
  const octokit = await app.getInstallationOctokit(installationId);
  const installToken = await getInstallationToken(app, installationId);

  const issue = payload.issue;
  const parsed = await parseIssueWithGemini(env, issue.title || "", issue.body || "");
  const generated = await generateFailingVitest(env, parsed);

  const workspaceId = sanitizeForPath(`${owner}-${repo}-${issueNumber}-${deliveryId}`);
  const workspace = `/tmp/bug-hunter-${workspaceId}`;
  const cloneUrl = `https://x-access-token:${encodeURIComponent(installToken)}@github.com/${owner}/${repo}.git`;
  const sessionId = `bug-hunter-${issueNumber}-${Date.now()}`;

  const cloneResult = await execInSandbox(
    env,
    `rm -rf ${shellEscape(workspace)} && git clone --depth=1 ${shellEscape(cloneUrl)} ${shellEscape(workspace)}`,
    BUG_CHECK_TIMEOUT_MS,
    sessionId,
  );

  if (!cloneResult.success) {
    await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
      owner,
      repo,
      issue_number: issueNumber,
      body: [
        "⚠️ Bug Hunter failed before test execution.",
        "",
        "Sandbox clone failed:",
        "```",
        toShortLog(cloneResult.stderr || cloneResult.stdout),
        "```",
      ].join("\n"),
    });
    return;
  }

  const testPath = `${workspace}/reproduction.test.ts`;
  await writeSandboxFile(env, testPath, generated.testCode, sessionId);

  const vitestResult = await execInSandbox(
    env,
    `cd ${shellEscape(workspace)} && vitest run reproduction.test.ts --reporter=verbose`,
    BUG_CHECK_TIMEOUT_MS,
    sessionId,
  );

  const outputBlock = toShortLog((vitestResult.stderr || "") + "\n" + (vitestResult.stdout || ""));

  if (vitestResult.exitCode !== 0) {
    await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
      owner,
      repo,
      issue_number: issueNumber,
      body: [
        "✅ Reproduction confirmed. Failing test case attached.",
        "",
        "```ts",
        generated.testCode,
        "```",
        "",
        "**Vitest output**",
        "```",
        outputBlock,
        "```",
      ].join("\n"),
    });
    return;
  }

  await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
    owner,
    repo,
    issue_number: issueNumber,
    body: [
      "⚠️ Bug Hunter generated a test, but it did not fail in sandbox.",
      "Please refine reproduction details and rerun.",
      "",
      "```ts",
      generated.testCode,
      "```",
      "",
      "**Vitest output**",
      "```",
      outputBlock,
      "```",
    ].join("\n"),
  });
}
