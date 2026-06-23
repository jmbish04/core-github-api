/**
 * @file EngineerAgent/methods/sandbox/git/status.ts
 * @description Returns the porcelain git status for the working directory inside the sandbox.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";

export interface GitStatusOptions {
  /** Directory inside the sandbox containing the git repo. Defaults to "repo". */
  targetDir?: string;
}

export interface GitStatusResult {
  success: boolean;
  dirty: boolean;
  output?: string;
  error?: string;
  message?: string;
}

export async function gitStatus(
  env: Env,
  sessionId: string,
  options: GitStatusOptions = {}
): Promise<GitStatusResult> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - gitStatus:");
  const loggerPrefix = `[SandboxSDK - gitStatus - ${sessionId}]`;
  const dir = options.targetDir ?? "repo";

  try {
    logger.info(`${loggerPrefix} Checking git status in ${dir}`);

    const result = await sandbox.exec(`cd ${dir} && git status --porcelain`);
    const output = result.stdout?.trim() ?? "";
    const dirty = output.length > 0;

    logger.info(`${loggerPrefix} Status: ${dirty ? "dirty" : "clean"}`);
    return {
      success: true,
      dirty,
      output,
      message: dirty ? "Working tree has uncommitted changes." : "Working tree is clean.",
    };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, dirty: false, error: error.message };
  }
}
