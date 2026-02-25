import { App } from "octokit";
import { z } from "zod";
import type { Agent } from "@openai/agents";
import { createRunner, resolveDefaultAiModel, resolveDefaultAiProvider } from "@/ai/agent-ai";
import { 
  getGitHubPrivateKey, 
  getGitHubAppId,
  getWorkerApiKey,
  getGithubToken,
  getGeminiApiKey,
  getOpenaiApiKey,
  getAnthropicApiKey,
  getCloudflareApiToken,
  getCloudflareAccountId
} from "@/utils/secrets";
import { SandboxClient } from "@/ai/mcp/tools/sandbox-sdk";
import { drizzle } from "drizzle-orm/d1";
import { alerts } from "@/db/schema";
import { getSecretsStoreClient } from "@/utils/cloudflare/secret-store";
import { generateUuid } from "@/utils/common";
import { WranglerInspectorService } from "@/services/github/wrangler-inspector";
import { getSandboxOptions } from "@/ai/utils/sandbox";

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

import type { SandboxExecResult } from "@/ai/mcp/tools/sandbox-sdk";
import { shellEscape, sanitizeForPath, truncateOutput } from "@/ai/mcp/tools/sandbox-sdk";


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
async function getSandboxClientForEnv(env: Env): Promise<SandboxClient> {
  return SandboxClient.create(env, "proactive-intelligence");
}

async function execInSandbox(
  env: Env,
  command: string,
  timeoutMs: number,
  sessionId?: string,
): Promise<SandboxExecResult> {
  const client = await getSandboxClientForEnv(env);
  return client.exec({ command, timeoutMs, sessionId });
}

async function writeSandboxFile(
  env: Env,
  filePath: string,
  content: string,
  _sessionId?: string,
): Promise<void> {
  const client = await getSandboxClientForEnv(env);
  const result = await client.writeFile({ path: filePath, content });
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
  const { Agent: OpenAIAgent } = await import("@openai/agents");
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
  const { Agent: OpenAIAgent } = await import("@openai/agents");
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
  const githubToken = await getGithubToken(env);
  const cfToken = await getCloudflareApiToken(env);

  const candidates: Array<[string, string | undefined]> = [
    ["WORKER_API_KEY", await getWorkerApiKey(env)],
    ["GITHUB_TOKEN", githubToken],
    ["GEMINI_API_KEY", await getGeminiApiKey(env)],
    ["GOOGLE_API_KEY", await getGeminiApiKey(env)],
    ["AI_GATEWAY_TOKEN", await env.AI_GATEWAY_TOKEN?.get()],
    ["CLOUDFLARE_API_TOKEN", cfToken],
    ["OPENAI_API_KEY", await getOpenaiApiKey(env)],
    ["ANTHROPIC_API_KEY", await getAnthropicApiKey(env)],
  ];

  const leaked = new Set<string>();

  for (const [name, value] of candidates) {
    if (!value) continue;
    if (scanOutput.includes(value)) {
      leaked.add(name);
    }
  }

  // Heuristic fallback if values are redacted in scan output.
  if (cfToken && scanOutput.toLowerCase().includes("cloudflare")) leaked.add(cfToken);
  if (githubToken && scanOutput.toLowerCase().includes("github")) leaked.add(githubToken);

  return Array.from(leaked);
}

/**
 * Rotates a secret in a worker script.
 * @param env - The environment bindings.
 * @param secretName - The name of the secret to rotate.
 * @param scriptName - The name of the worker script (not this worker core-github-api, but a target worker that core-github-api is attempting to manage).
 * @returns A promise that resolves to an object with a success boolean and a detail string.
 */
async function rotateWorkerSecret(
  env: Env,
  secretName: string,
  origins: { process: string; repo: string; worker: string }
): Promise<{ success: boolean; detail: string }> {
  try {
    const db = drizzle(env.DB);
    const client = await getSecretsStoreClient(env);
    
    // 1. Resolve Store (Assuming default/single store for now)
    const store = await client.getDefaultStore();
    
    // 2. Find Secret
    const secret = await client.getSecretByName(store.id, secretName);
    
    // 3. Prepare Alert Data
    const alertId = generateUuid();
    const timestamp = new Date();
    
    if (!secret) {
      // Secret not found in store - likely a direct binding or env var
      await db.insert(alerts).values({
        id: alertId,
        timestamp,
        title: `Leaked Secret Detected: ${secretName}`,
        description: `A leaked secret (${secretName}) was detected but could not be found in the global Secret Store. It may be a direct environment variable.`,
        processOrigin: origins.process,
        repoOrigin: origins.repo,
        workerOrigin: origins.worker,
        isActionNeeded: true,
        actionRequired: "Manually rotate this secret in the Cloudflare Dashboard immediately.",
        isResolved: false,
      });
      
      return { success: false, detail: "Secret not found in store" };
    }

    // 4. Rotate (Nuke) the Secret
    const replacement = `${secretName}_ROTATED_${generateUuid().replace(/-/g, "")}`;
    await client.patchSecret(store.id, secret.id, { text: replacement });

    // 5. Create Alert
    await db.insert(alerts).values({
      id: alertId,
      timestamp,
      title: `Secret Rotated: ${secretName}`,
      description: `A leaked secret (${secretName}) was detected and automatically rotated to a placeholder value in the Secret Store to prevent abuse.`,
      processOrigin: origins.process,
      repoOrigin: origins.repo,
      workerOrigin: origins.worker,
      isActionNeeded: true,
      actionRequired: "Generate a new valid token/key and update it in the Cloudflare Secret Store.",
      isResolved: false,
    });

    return { success: true, detail: "Rotated in Secret Store" };

  } catch (error: any) {
    console.error(`[rotateWorkerSecret] Failed to rotate ${secretName}:`, error);
    
    // Log failure alert
    try {
        const db = drizzle(env.DB);
        await db.insert(alerts).values({
            id: generateUuid(),
            timestamp: new Date(),
            title: `Rotation Failed: ${secretName}`,
            description: `Attempted to rotate leaked secret ${secretName} but failed. Error: ${error.message}`,
            processOrigin: origins.process,
            repoOrigin: origins.repo,
            workerOrigin: origins.worker,
            isActionNeeded: true,
            actionRequired: "Investigate logs and manually rotate the secret.",
            isResolved: false,
        });
    } catch (e) {
        console.error("Failed to log failure alert to D1", e);
    }
    
    return { success: false, detail: error.message };
  }
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
  // Determine origin for alerts
  let scriptName: string = 'worker unknown';
  
  try {
      const inspector = new WranglerInspectorService(octokit);
      // Attempt to find wrangler config in root, then backend/
      // we try root first
      try {
        const config = await inspector.getWranglerConfig(owner, repo);
        if (config.name) scriptName = config.name;
      } catch (e) {
         // try backend/
         const config = await inspector.getWranglerConfig(owner, repo, "backend");
         if (config.name) scriptName = config.name;
      }
  } catch (e) {
      console.warn(`[LeakPlumber] Failed to inspect wrangler config for ${owner}/${repo}:`, e);
      // Fallback to default scriptName
  }

  const origins = {
    process: "LeakPlumber",
    repo: `${owner}/${repo}`,
    worker: scriptName
  };

  const compromisedBindings = await getCompromisedBindings(env, scanOutput);
  const rotationResults: Array<{ name: string; success: boolean; detail: string }> = [];
  for (const bindingName of compromisedBindings) {
    const result = await rotateWorkerSecret(env, bindingName, origins);
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
