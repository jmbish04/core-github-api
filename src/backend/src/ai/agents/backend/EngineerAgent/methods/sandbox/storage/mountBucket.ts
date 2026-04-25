/**
 * @file EngineerAgent/methods/sandbox/storage/mountBucket.ts
 * @description Mounts a Cloudflare R2 bucket into the sandbox filesystem via sandbox.mountBucket().
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { MountBucketOptions } from "./types";

export async function mountBucket(
  env: Env,
  sessionId: string,
  mountPath: string = "/mnt/r2",
  options: MountBucketOptions
): Promise<{ success: boolean; mountPath?: string; error?: string; message?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - mountBucket:");
  const loggerPrefix = `[SandboxSDK - mountBucket - ${sessionId}]`;

  try {
    logger.info(`${loggerPrefix} Mounting R2 bucket at ${mountPath} (readOnly=${options.readOnly ?? false})`);
    await sandbox.mountBucket(env.SANDBOX_BUCKET as any, mountPath, options as any);
    logger.info(`${loggerPrefix} Bucket mounted at ${mountPath}`);
    return { success: true, mountPath, message: `Bucket mounted at ${mountPath}` };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
