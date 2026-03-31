/**
 * @file backend/src/routes/api/webhooks/workflows/leak-plumber/index.ts
 * @description The Leak Plumber Workflow responder. Constantly assesses tracking on inbound repository visibility switches.
 *              When a repo is transitioned to public access arbitrarily, it preemptively scans historical commit git trees 
 *              for compromised tokens matching organizational standards using TruffleHog.
 *              Identifies API key leakage, quarantines issues, securely rotates matched endpoints, and leaves forensic paper trails.
 *              Optimized for automated code agents reviewing security response postures securely.
 * @module leak-plumber
 */

import { drizzle } from "drizzle-orm/d1";
import { alerts } from "@/db/schema";
import { getSecretsStoreClient } from "@/utils/cloudflare/secret-store";
import { generateUuid } from "@/utils/common";
import { WranglerInspectorService } from "@/services/github/wrangler-inspector";
import { execInSandbox, createGitHubApp, getInstallationToken, toShortLog } from "../../shared/sandbox";
import { shellEscape } from "@/ai/mcp/tools/sandbox-sdk";
import { 
  getWorkerApiKey,
  getGithubToken,
  getGeminiApiKey,
  getOpenaiApiKey,
  getAnthropicApiKey,
  getCloudflareApiToken
} from "@/utils/secrets";

const LEAK_CHECK_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Discriminator evaluation boolean correlating precise repository event meta-data flags indicating it went public.
 * 
 * @param payload - Bound GitHub incoming repository structural configuration.
 * @returns {boolean} Check evaluation dictating Leak Plumber triggering logic dynamically.
 */
export function shouldRunLeakPlumber(payload: any): boolean {
  if (!payload?.repository) return false;

  if (payload?.action === "publicized" || payload?.action === "public") {
    return true;
  }

  const becamePublic = payload?.changes?.private?.from === true && payload?.repository?.private === false;
  return becamePublic;
}

/**
 * Contextually indexes output strings extracted from the vulnerability scanning sandbox environment matching directly 
 * to known operational API bindings ensuring high-precision active-layer validation tracking.
 * 
 * @param env - Global worker request bindings resolving environment credentials logically.
 * @param scanOutput - Unstructured console text block reported from sandbox threat toolings (TruffleHog).
 * @returns {Promise<string[]>} Validated sequence array indexing known internal variable schema assignments actively found in cleartext outputs.
 */
async function getCompromisedBindings(env: Env, scanOutput: string): Promise<string[]> {
  const githubToken = await getGithubToken(env);
  const cfToken = await getCloudflareApiToken(env);

  const candidates: Array<[string, string | undefined]> = [
    ["WORKER_API_KEY", await getWorkerApiKey(env)],
    ["GITHUB_PERSONAL_ACCESS_TOKEN", githubToken],
    ["GEMINI_API_KEY", await getGeminiApiKey(env)],
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

  // Heuristic fallback if direct value comparisons are masked or omitted in output structure logic streams.
  if (cfToken && scanOutput.toLowerCase().includes("cloudflare")) leaked.add("CLOUDFLARE_API_TOKEN");
  if (githubToken && scanOutput.toLowerCase().includes("github")) leaked.add("GITHUB_PERSONAL_ACCESS_TOKEN");

  return Array.from(leaked);
}

/**
 * Forces state-mutation actions substituting detected vulnerable Cloudflare secrets rapidly inside the integrated platform Secret Store ecosystem.
 * Acts deterministically ensuring system stability gracefully. Fails gracefully leaving robust historical warning payloads.
 * 
 * @param env - Backing persistence storage binding models.
 * @param secretName - Operational key designation flagged under compromised discovery processes.
 * @param origins - Source tracking objects aligning telemetry against deployment contexts structurally.
 * @returns {Promise<{ success: boolean; detail: string }>} Summary payload signaling remediation closure attempts.
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
    
    if (!secret) {
      // Secret not found in store - likely a direct binding or env var
      await db.insert(alerts).values({
        id: alertId,
        title: `Leaked Secret Detected: ${secretName}`,
        description: `A leaked secret (${secretName}) was detected but could not be found in the global Secret Store. It may be a direct environment variable.`,
        process_origin: origins.process,
        repo_origin: origins.repo,
        worker_origin: origins.worker,
        is_action_needed: true,
        action_required: "Manually rotate this secret in the Cloudflare Dashboard immediately.",
        is_resolved: false,
      });
      
      return { success: false, detail: "Secret not found in store" };
    }

    // 4. Rotate (Nuke) the Secret
    const replacement = `${secretName}_ROTATED_${generateUuid().replace(/-/g, "")}`;
    await client.patchSecret(store.id, secret.id, { text: replacement });

    // 5. Create Alert
    await db.insert(alerts).values({
      id: alertId,
      title: `Secret Rotated: ${secretName}`,
      description: `A leaked secret (${secretName}) was detected and automatically rotated to a placeholder value in the Secret Store to prevent abuse.`,
      process_origin: origins.process,
      repo_origin: origins.repo,
      worker_origin: origins.worker,
      is_action_needed: true,
      action_required: "Generate a new valid token/key and update it in the Cloudflare Secret Store.",
      is_resolved: false,
    });

    return { success: true, detail: "Rotated in Secret Store" };

  } catch (error: any) {
    console.error(`[rotateWorkerSecret] Failed to rotate ${secretName}:`, error);
    
    // Log failure alert
    try {
        const db = drizzle(env.DB);
        await db.insert(alerts).values({
            id: generateUuid(),
            title: `Rotation Failed: ${secretName}`,
            description: `Attempted to rotate leaked secret ${secretName} but failed. Error: ${error.message}`,
            process_origin: origins.process,
            repo_origin: origins.repo,
            worker_origin: origins.worker,
            is_action_needed: true,
            action_required: "Investigate logs and manually rotate the secret.",
            is_resolved: false,
        });
    } catch (e) {
        console.error("Failed to log failure alert to D1", e);
    }
    
    return { success: false, detail: error.message };
  }
}

/**
 * Top-level invocation for Leak Plumber. Clones targeted repos, sequences historical validation scanning 
 * loops, evaluates matched tokens natively, enforces privacy corrections iteratively, modifies key states proactively,
 * and authors postmortem records systematically onto the repository itself.
 * 
 * @param params - Execution container options wrapping environmental bindings and webhook state dependencies natively.
 */
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
