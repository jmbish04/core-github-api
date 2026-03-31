/**
 * Utility module for Cloudflare Sandbox SDK configuration.
 * Provides standardized options and configurations for spawning secure 
 * containerized code execution environments.
 */

/**
 * Retrieves the default configuration options for initializing a Cloudflare Sandbox instance.
 * These options extend the container's lifecycle and adjust timeouts to accommodate 
 * longer provisioning and startup phases typical of complex AI workloads.
 * 
 * @param env - The Cloudflare Worker environment bindings
 * @returns The Sandbox constructor options
 */
export async function getSandboxOptions(env: Env) {
    return {
        sleepAfter: env.SANDBOX_SLEEP_AFTER || '30s',
        keepAlive: true,
        normalizeId: true,
        containerTimeouts: {
            instanceGetTimeoutMS: env.SANDBOX_INSTANCE_GET_TIMEOUT_MS || 180_000,   // 3 minutes for provisioning
            portReadyTimeoutMS: env.SANDBOX_PORT_READY_TIMEOUT_MS || 180_000, // 3 minutes for startup work
        }
    }
}