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
        // 💡 Scale-to-zero: container sleeps automatically after 10 min of inactivity.
        // keepAlive must be false (default) so the sleepAfter timer is honoured.
        sleepAfter: env.SANDBOX_SLEEP_AFTER || '10m',
        keepAlive: false,
        normalizeId: true,
        containerTimeouts: {
            instanceGetTimeoutMS: 180_000,   // 3 minutes for provisioning
            portReadyTimeoutMS: 180_000, // 3 minutes for startup work
        }
    }
}