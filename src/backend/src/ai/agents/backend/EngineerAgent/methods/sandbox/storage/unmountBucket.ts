/**
 * @file EngineerAgent/methods/sandbox/storage/unmountBucket.ts
 * @description Unmounts an R2 bucket from the sandbox filesystem.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";

export async function unmountBucket(
  env: Env,
  sessionId: string,
  mountPath: string = "/mnt/r2"
): Promise<{ success: boolean; error?: string; message?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - unmountBucket:");
  const loggerPrefix = `[SandboxSDK - unmountBucket - ${sessionId}]`;

  try {
    logger.info(`${loggerPrefix} Unmounting bucket at ${mountPath}`);
    // Sandbox SDK uses exec-level umount; unmountBucket wraps it cleanly
    await sandbox.exec(`umount "${mountPath}" 2>/dev/null || true`);
    return { success: true, message: `Unmounted ${mountPath}` };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
