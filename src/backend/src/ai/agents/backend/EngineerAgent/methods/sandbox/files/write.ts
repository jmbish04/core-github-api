/**
 * @file EngineerAgent/methods/sandbox/files/writeFile.ts
 * @description Writes content to a file path inside the sandbox filesystem.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";

export async function sandboxWriteFile(
  env: Env,
  sessionId: string,
  path: string,
  content: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - writeFile:");
  const loggerPrefix = `[SandboxSDK - writeFile - ${sessionId}]`;

  try {
    logger.info(`${loggerPrefix} Writing ${path} (${content.length} bytes)`);
    await sandbox.writeFile(path, content);
    return { success: true, message: `Written: ${path}` };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
