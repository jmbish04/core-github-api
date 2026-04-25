/**
 * @file EngineerAgent/methods/sandbox/files/deleteFile.ts
 * @description Deletes a file from the sandbox filesystem via rm -f.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";

export async function sandboxDeleteFile(
  env: Env,
  sessionId: string,
  path: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - deleteFile:");
  const loggerPrefix = `[SandboxSDK - deleteFile - ${sessionId}]`;

  try {
    logger.info(`${loggerPrefix} Deleting ${path}`);
    await sandbox.exec(`rm -f "${path}"`);
    return { success: true, message: `Deleted: ${path}` };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
