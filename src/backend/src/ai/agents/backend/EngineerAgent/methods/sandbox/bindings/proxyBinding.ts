/**
 * @file EngineerAgent/methods/sandbox/bindings/proxyBinding.ts
 * @description Injects Cloudflare binding configuration as a JSON file inside the sandbox.
 *              Allows sandbox-executed code to reference binding metadata without direct access
 *              to the Worker runtime binding objects.
 *
 * @security - Binding objects themselves are NOT serialized into the sandbox.
 *           - Only non-secret metadata (binding name, type, endpoint) is written.
 *           - The sandbox calls back to the Worker's own binding-proxy API endpoints.
 */
import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import type { BindingProxyOptions } from "./types";

export async function proxyBinding(
  env: Env,
  sessionId: string,
  options: BindingProxyOptions
): Promise<{ success: boolean; configPath?: string; error?: string; message?: string }> {
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - proxyBinding:");
  const loggerPrefix = `[SandboxSDK - proxyBinding - ${sessionId}]`;
  const configPath = options.configPath ?? `/tmp/binding-${options.name}.json`;

  try {
    logger.info(`${loggerPrefix} Injecting binding config for "${options.name}" → ${configPath}`);

    // Serialize non-secret binding metadata for sandbox consumption
    const bindingMeta = JSON.stringify(
      {
        name: options.name,
        // The sandbox code should call back to the Worker proxy endpoint
        // e.g. POST /api/sandbox/binding/${options.name} — not the raw binding
        proxyEndpoint: `/api/sandbox/binding/${options.name}`,
        sessionId,
      },
      null,
      2
    );

    await sandbox.writeFile(configPath, bindingMeta);
    logger.info(`${loggerPrefix} Binding config written to ${configPath}`);
    return { success: true, configPath, message: `Binding "${options.name}" proxied at ${configPath}` };
  } catch (error: any) {
    logger.error(`${loggerPrefix} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
