/**
 * @file EngineerAgent/methods/sandbox.ts
 * @description Absorbed from SandboxAgent.ts — Cloudflare Sandbox SDK operations.
 *              All methods are pure functions receiving dependencies via DI.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { getGitHubPrivateKey } from "@/utils/secrets";
import { Logger } from "@/lib/logger";

export async function gitCheckout(
  env: Env,
  repoUrl: string,
  sessionId: string,
  options?: { branch?: string; targetDir?: string },
): Promise<{ success: boolean; message?: string; error?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - gitCheckout:");
  const loggerPrefix = `[SandboxSDK - gitCheckout - ${sessionId}]`;
  try {
    let cloneUrl = repoUrl;
    logger.info(`${loggerPrefix} Cloning ${cloneUrl}`);
    const githubToken = await getGitHubPrivateKey(env);
    if (githubToken && cloneUrl.includes("github.com")) {
      cloneUrl = cloneUrl.replace("https://", `https://${githubToken}@`);
    }

    await sandbox.gitCheckout(cloneUrl, {
      ...(options?.branch && { branch: options.branch }),
      depth: 1,
      targetDir: options?.targetDir ?? "repo",
    });

    logger.info(`${loggerPrefix} Checked out into ${options?.targetDir ?? "repo"}`);
    return { success: true, message: `Checked out into ${options?.targetDir ?? "repo"}` };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed to checkout: ${JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}