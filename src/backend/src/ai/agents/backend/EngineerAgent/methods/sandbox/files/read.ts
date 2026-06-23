/**
 * @file EngineerAgent/methods/sandbox/files/readFile.ts
 * @description Reads a file from the sandbox filesystem.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";

export async function sandboxReadFile(
  env: Env,
  sessionId: string,
  path: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - readFile:");
  const loggerPrefix = `[SandboxSDK - readFile - ${sessionId}]`;

  try {
    logger.info(`${loggerPrefix} Reading ${path}`);
    const result = await sandbox.readFile(path);
    return { success: true, content: result.content };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
