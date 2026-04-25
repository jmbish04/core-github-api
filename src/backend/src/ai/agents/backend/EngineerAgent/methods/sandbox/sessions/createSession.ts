/**
 * @file EngineerAgent/methods/sandbox/sessions/createSession.ts
 * @description Bootstraps a new Sandbox session against our custom container image.
 *
 * Container features (from Dockerfile):
 *  - Python (base image: cloudflare/sandbox:0.8.8-python)
 *  - OpenCode CLI at /usr/local/bin/opencode
 *  - trufflehog secret scanner
 *  - code-server (VS Code) at port 8080
 *  - Colby Agent HTTP + WebSocket control server at port 8788 (container/src/server.ts)
 *  - Claude agent SDK Socket.IO server at port 3001 (container/agent-sdk.ts)
 *
 * Binding injection:
 *  Worker bindings (D1/KV/R2) cannot be passed directly into a container process.
 *  Instead we write a JSON manifest at /workspace/.colby/bindings.json pointing
 *  the container-server at the Worker's /api/sandbox/proxy/* endpoints.
 *  The container then calls back through those proxy endpoints for all DB/KV/R2 ops.
 */

import { getSandbox } from "@cloudflare/sandbox";
import { Logger } from "@/lib/logger";
import { getSecret } from "@/utils/secrets";
import type { CreateSessionOptions } from "./types";

export async function createSession(
  env: Env,
  sessionId: string,
  options: CreateSessionOptions = {}
): Promise<{ success: boolean; sessionId?: string; error?: string; message?: string; controlUrl?: string }> {
  const { injectBindings = true } = options;
  const sandbox = getSandbox(env.SANDBOX, sessionId);
  const logger = new Logger(env, "SandboxSDK - createSession");
  const tag = `[createSession][${sessionId}]`;

  try {
    // ── 1. Resolve secrets ────────────────────────────────────────────────
    const githubToken = options.githubToken ?? (await getSecret(env, "GITHUB_PERSONAL_ACCESS_TOKEN") as string);
    const anthropicKey = await getSecret(env, "ANTHROPIC_API_KEY") as string | undefined;
    const workerApiKey = await getSecret(env, "WORKER_API_KEY") as string;

    // ── 2. Inject Worker binding proxy manifest ───────────────────────────
    if (injectBindings) {
      logger.info(`${tag} Writing binding manifest...`);
      await sandbox.exec("mkdir -p /workspace/.colby");
      await sandbox.writeFile(
        "/workspace/.colby/bindings.json",
        JSON.stringify({
          d1ProxyUrl: `${env.BASE_URL}/api/sandbox/proxy/d1`,
          kvProxyUrl: `${env.BASE_URL}/api/sandbox/proxy/kv`,
          r2ProxyUrl: `${env.BASE_URL}/api/sandbox/proxy/r2`,
          workerApiKey,
        })
      );
    }

    // ── 3. Start the Colby container control server ───────────────────────
    logger.info(`${tag} Starting control server...`);
    await sandbox.startProcess("bun run start", {
      cwd: "/app",
      env: {
        GITHUB_TOKEN: githubToken,
        GH_TOKEN: githubToken,                         // gh CLI uses GH_TOKEN
        ...(anthropicKey ? { ANTHROPIC_API_KEY: anthropicKey, CLAUDE_CODE_OAUTH_TOKEN: anthropicKey } : {}),
        COLBY_WORKER_URL: env.BASE_URL,
        COLBY_WORKER_API_KEY: workerApiKey,
        COLBY_CONTROL_PORT: `${env.SANDBOX_CONTROL_PORT}`,
        PORT: "3001",
      },
    });

    // ── 4. Expose the control port so the Worker can communicate with the container ─
    logger.info(`${tag} Exposing control port 8788...`);
    const portResult = await sandbox.exposePort(8788, { hostname: "localhost" });
    const controlUrl = (portResult as any)?.url ?? `sandbox-${sessionId}.workers.dev`;

    logger.info(`${tag} ✓ Session ready — controlUrl=${controlUrl}`);
    return { success: true, sessionId, message: `Session ${sessionId} is ready`, controlUrl };
  } catch (error: any) {
    logger.error(`${tag} Failed: ${error.message || JSON.stringify(error)}`);
    return { success: false, error: error.message };
  }
}
