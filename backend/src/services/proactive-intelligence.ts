import { App } from "octokit";
import { z } from "zod";
import { Agent as OpenAIAgent } from "@openai/agents";
import { createRunner, resolveDefaultAiModel, resolveDefaultAiProvider } from "../lib/agent-ai";
import type { Bindings } from "../utils/hono";
import { getGitHubPrivateKey, getGitHubAppId } from "../utils/secrets";
import { SandboxClient } from "@sandbox-sdk-tools";

const LEAK_CHECK_TIMEOUT_MS = 10 * 60 * 1000;
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

import type { SandboxExecResult } from "@sandbox-sdk-tools";
import { shellEscape, sanitizeForPath, truncateOutput } from "@sandbox-sdk-tools";

function toShortLog(output: string, max = 4000): string {
  return truncateOutput(output, max);
}

function hasBugLabel(labels: any[] = []): boolean {
  return labels.some((label) => {
    if (typeof label === "string") return label.toLowerCase() === "bug";
    return String(label?.name || "").toLowerCase() === "bug";
  });
}

export function shouldRunBugHunter(payload: any): boolean {
  return payload?.action === "opened" && hasBugLabel(payload?.issue?.labels || []);
}

export function shouldRunLeakPlumber(payload: any): boolean {
  if (!payload?.repository) return false;

  if (payload?.action === "publicized" || payload?.action === "public") {
    return true;
  }

  const becamePublic = payload?.changes?.private?.from === true && payload?.repository?.private === false;
  return becamePublic;
}

/**
 * Build a SandboxClient from the env's SANDBOX binding.
 * Uses a single shared sandbox ID for proactive intelligence workflows.
 */
function getSandboxClientForEnv(env: Env): SandboxClient {
  return SandboxClient.create((env as any).SANDBOX, "proactive-intelligence");
}

async function execInSandbox(
  env: Env,
  command: string,
  timeoutMs: number,
  sessionId?: string,
): Promise<SandboxExecResult> {
  return getSandboxClientForEnv(env).exec({ command, timeoutMs, sessionId });
}

async function writeSandboxFile(
  env: Env,
  filePath: string,
  content: string,
  _sessionId?: string,
): Promise<void> {
  const result = await getSandboxClientForEnv(env).writeFile({ path: filePath, content });
  if (!result.success) {
    throw new Error(`Failed to write ${filePath} in sandbox`);
  }
}

async function createGitHubApp(env: Env): Promise<App> {
  return new App({
    appId: await getGitHubAppId(env),
    privateKey: await getGitHubPrivateKey(env),
  });
}

async function getInstallationToken(app: App, installationId: number): Promise<string> {
  const response = await app.octokit.request("POST /app/installations/{installation_id}/access_tokens", {
    installation_id: installationId,
  });
  return response.data.token;
}

async function parseIssueWithGemini(env: Env, issueTitle: string, issueBody: string) {
  const provider = resolveDefaultAiProvider(env);
  const model = (env as any).BUG_HUNTER_MODEL || resolveDefaultAiModel(env, provider);
  const runner = await createRunner(env, provider, model);
  const parser = new OpenAIAgent({
    name: "BugHunterIssueParser",
    model,
    outputType: ParsedIssueSchema,
    instructions:
      "Parse bug reports into concise, deterministic engineering notes. Return only structured JSON.",
  });
  const prompt = [
    "Parse this GitHub bug report into structured engineering notes.",
    "Keep each reproduction step concise and deterministic.",
    `Issue title: ${issueTitle}`,
    `Issue body:\n${issueBody || "(empty)"}`,
  ].join("\n\n");

  const result = await runner.run(parser, prompt);
  return ParsedIssueSchema.parse(result.finalOutput ?? {});
}

async function generateFailingVitest(env: Env, parsedIssue: z.infer<typeof ParsedIssueSchema>) {
  const provider = resolveDefaultAiProvider(env);
  const model = (env as any).BUG_HUNTER_MODEL || resolveDefaultAiModel(env, provider);
  const runner = await createRunner(env, provider, model);
  const generator = new OpenAIAgent({
    name: "BugHunterTestGenerator",
    model,
    outputType: GeneratedTestSchema,
    instructions:
      "Generate a single-file failing Vitest reproduction test. Return only structured JSON with valid TypeScript in testCode.",
  });
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

  const result = await runner.run(generator, prompt);
  return GeneratedTestSchema.parse(result.finalOutput ?? {});
}

async function getCompromisedBindings(env: Env, scanOutput: string): Promise<string[]> {
  const githubToken = await env.GITHUB_TOKEN?.get();
  const cfToken = await env.CLOUDFLARE_API_TOKEN?.get();

  const candidates: Array<[string, string | undefined]> = [
    ["WORKER_API_KEY", (env as any).WORKER_API_KEY],
    ["GITHUB_TOKEN", githubToken],
    ["GEMINI_API_KEY", (env as any).GEMINI_API_KEY],
    ["GOOGLE_API_KEY", (env as any).GOOGLE_API_KEY],
    ["AI_GATEWAY_TOKEN", (env as any).AI_GATEWAY_TOKEN],
    ["CLOUDFLARE_API_TOKEN", cfToken],
    ["OPENAI_API_KEY", (env as any).OPENAI_API_KEY],
    ["ANTHROPIC_API_KEY", (env as any).ANTHROPIC_API_KEY],
  ];

  const leaked = new Set<string>();

  for (const [name, value] of candidates) {
    if (!value) continue;
    if (scanOutput.includes(value)) {
      leaked.add(name);
    }
  }

  // Heuristic fallback if values are redacted in scan output.
  if (scanOutput.toLowerCase().includes("cloudflare")) leaked.add("CLOUDFLARE_API_TOKEN");
  if (scanOutput.toLowerCase().includes("github")) leaked.add("GITHUB_TOKEN");

  return Array.from(leaked);
}

async function rotateWorkerSecret(
  env: Env,
  secretName: string,
): Promise<{ success: boolean; detail: string }> {
  const accountId =
    (env as any).CLOUDFLARE_ACCOUNT_ID || env.GITHUB_ACTION_CLOUDFLARE_ACCOUNT_ID;
  const apiToken = await env.CLOUDFLARE_API_TOKEN.get();
  const scriptName = (env as any).CLOUDFLARE_WORKER_NAME || "core-github-api";

  if (!accountId || !apiToken) {
    return {
      success: false,
      detail: "Missing CLOUDFLARE_ACCOUNT_ID/GITHUB_ACTION_CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN.",
    };
  }

  const replacement = `${secretName}_ROTATED_${crypto.randomUUID().replace(/-/g, "")}`;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/secrets`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: secretName,
      text: replacement,
      type: "secret_text",
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    return { success: false, detail: error };
  }

  return { success: true, detail: "rotated" };
}

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

export async function runLeakPlumberWorkflow(params: {
  env: Env;
  payload: any;
}): Promise<void> {
  const { env, payload } = params;
  const owner = payload?.repository?.owner?.login;
  const repo = payload?.repository?.name;
  const installationId = payload?.installation?.id;

  if (!owner || !repo || !installationId) {
    console.warn("[LeakPlumber] Missing required payload fields.");
    return;
  }

  const app = await createGitHubApp(env);
  const octokit = await app.getInstallationOctokit(installationId);
  const installToken = await getInstallationToken(app, installationId);

  const repoUrl = `https://x-access-token:${encodeURIComponent(installToken)}@github.com/${owner}/${repo}.git`;
  const scanCommand = `trufflehog git --json --no-update ${shellEscape(repoUrl)}`;
  const scanResult = await execInSandbox(env, scanCommand, LEAK_CHECK_TIMEOUT_MS, `leak-plumber-${Date.now()}`);
  const scanOutput = `${scanResult.stdout}\n${scanResult.stderr}`;

  const findings = scanOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (findings.length === 0) {
    console.log("[LeakPlumber] No leaked secrets detected.");
    return;
  }

  await octokit.request("PATCH /repos/{owner}/{repo}", {
    owner,
    repo,
    private: true,
  });

  const compromisedBindings = await getCompromisedBindings(env, scanOutput);
  const rotationResults: Array<{ name: string; success: boolean; detail: string }> = [];
  for (const bindingName of compromisedBindings) {
    const result = await rotateWorkerSecret(env, bindingName);
    rotationResults.push({ name: bindingName, ...result });
  }

  // Log incident in repository issue for auditability.
  await octokit.request("POST /repos/{owner}/{repo}/issues", {
    owner,
    repo,
    title: "🚨 Leak Plumber Incident: Repository auto-privatized",
    body: [
      "TruffleHog detected secrets after repository became public.",
      "",
      `- Findings detected: ${findings.length}`,
      `- Repository visibility changed to private: yes`,
      `- Cloudflare secret rotations attempted: ${rotationResults.length}`,
      "",
      "Rotation results:",
      ...rotationResults.map((item) => `- ${item.name}: ${item.success ? "rotated" : `failed (${item.detail})`}`),
      "",
      "Raw scanner output (truncated):",
      "```",
      toShortLog(scanOutput),
      "```",
    ].join("\n"),
  }).catch((error: unknown) => {
    console.error("[LeakPlumber] Failed to create incident issue:", error);
  });
}
