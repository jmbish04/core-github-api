/**
 * @file backend/src/routes/api/webhooks/workflows/shared/sandbox.ts
 * @description Provides shared sandbox execution and file management utilities 
 *              for proactive intelligence workflows. 
 *              Optimized for AI coding agents: explicitly encapsulates lifecycle, Auth tokens, and isolated sandboxing execution models for deterministic background tasks.
 * @module shared/sandbox
 */

import { App } from "octokit";
import { SandboxClient } from "@/ai/mcp/tools/sandbox-sdk";
import { getGitHubPrivateKey, getGitHubAppId } from "@/utils/secrets";
import { truncateOutput } from "@/ai/mcp/tools/sandbox-sdk";
import type { SandboxExecResult } from "@/ai/mcp/tools/sandbox-sdk";
import { getSandboxOptions } from "@/ai/utils/sandbox";

/**
 * Builds a SandboxClient derived from the bound environment SANDBOX configuration.
 * Groups intelligence workloads into a shared logical identity name "proactive-intelligence".
 * 
 * @param env - The Cloudflare worker environment variables/bindings.
 * @returns {Promise<SandboxClient>} The configured remote sandbox client ready for file and execution commands.
 */
export async function getSandboxClientForEnv(env: Env): Promise<SandboxClient> {
  const id = "proactive-intelligence";
  const options = await getSandboxOptions(env);
  return SandboxClient.create(env, id, options);
}

/**
 * Executes a bash command safely inside the ephemeral sandbox container.
 * Enforces a strict timeout interval to avoid unbounded zombie executions on isolated VMs.
 * 
 * @param env - Request environment variables.
 * @param command - The pre-sanitized command line expression to run.
 * @param timeoutMs - Max execution time allowed in milliseconds.
 * @param sessionId - Optional explicit session identifier for caching resources contextually.
 * @returns {Promise<SandboxExecResult>} Deterministic command output, exit codes, and durations.
 */
export async function execInSandbox(
  env: Env,
  command: string,
  timeoutMs: number,
  sessionId?: string,
): Promise<SandboxExecResult> {
  const client = await getSandboxClientForEnv(env);
  return client.exec({ command, timeoutMs, sessionId });
}

/**
 * Writes or overwrites a file directly within the remote executing sandbox's file system storage volume.
 * Facilitates deploying uncommitted or speculative files into a runner environment prior to execution.
 * 
 * @param env - Execution environment.
 * @param filePath - Absolute or relative path inside the sandbox where file code is injected.
 * @param content - Body contents mapped to the injected file.
 * @param _sessionId - Optional execution continuity session cache identifier.
 */
export async function writeSandboxFile(
  env: Env,
  filePath: string,
  content: string,
  _sessionId?: string,
): Promise<void> {
  const client = await getSandboxClientForEnv(env);
  const result = await client.writeFile({ path: filePath, content });
  if (!result.success) {
    throw new Error(`Failed to write file ${filePath} safely in sandbox execution context`);
  }
}

/**
 * Authenticates and initializes a discrete GitHub App instance providing 
 * elevated, state-modifying access scopes for executing intelligent autonomous workflows.
 * 
 * @param env - Secure environment interface exposing GitHub key tokens.
 * @returns {Promise<App>} Authenticated `App` mapping ready for scoped installations.
 */
export async function createGitHubApp(env: Env): Promise<App> {
  return new App({
    appId: await getGitHubAppId(env),
    privateKey: await getGitHubPrivateKey(env),
  });
}

/**
 * Mints an ephemeral, limited-lifetime GitHub installation access token. 
 * Allows the runner to act on restricted repos directly in background webhooks.
 * 
 * @param app - Initialized primary App representation.
 * @param installationId - Targeted repository's GitHub installation ID scope.
 * @returns {Promise<string>} Transient session-friendly access token.
 */
export async function getInstallationToken(app: App, installationId: number): Promise<string> {
  const response = await app.octokit.request("POST /app/installations/{installation_id}/access_tokens", {
    installation_id: installationId,
  });
  return response.data.token;
}

/**
 * Safely truncates console outputs to avoid token limit overflow on AI models 
 * or payload rejection from platform API comment character restrictions.
 * 
 * @param output - Raw process output buffers.
 * @param max - Maximum character threshold; defaults to 4000 limit.
 * @returns {string} Processed text truncated symmetrically if oversize.
 */
export function toShortLog(output: string, max = 4000): string {
  return truncateOutput(output, max);
}
