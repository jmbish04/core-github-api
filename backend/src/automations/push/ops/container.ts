/**
 * @file src/gardener/ops/container-manager.ts
 * @description Orchestrates Cloudflare Containers for heavy duty tasks.
 */

import type { PushContext } from '../fixers/types';

export class ContainerManager {
    constructor(private env: any) { } // using any for env momentarily to avoid type hassles with dynamic binding

    /**
     * Executes a task in the centralized container.
     */
    async executeTask(ctx: PushContext, task: string, payload: any) {
        console.log(`[ContainerManager] Preparing to execute '${task}'...`);

        // 1. Get Installation Token
        // context should already have octokit, but we might need the raw token to embed in URL.
        // The GardenerContext doesn't strictly carry the raw token string by default unless we add it.
        // We can re-generate it using the App class if needed, or if ctx.octokit is an installation instance, 
        // extracting the token is harder.
        // Ideally we pass it in or fetch a fresh one.

        let token = "";
        try {
            // Re-auth to get a raw token for the git URL
            const { data } = await ctx.octokit.request('POST /app/installations/{installation_id}/access_tokens', {
                installation_id: (ctx as any).installationId // We need to ensure we have this in context
            });
            token = data.token;
        } catch (e) {
            console.error('Failed to get token for container', e);
            throw new Error("Could not authenticate for container ops");
        }

        // 2. Construct Authenticated URL
        // https://x-access-token:TOKEN@github.com/owner/repo.git
        const repoUrl = `https://x-access-token:${token}@github.com/${ctx.repo.owner}/${ctx.repo.name}.git`;

        // 3. Call Supervisor DO
        // We generate a unique operation ID for this run
        const operationId = `op-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        console.log(`[ContainerManager] Spawning Supervisor ${operationId}`);

        try {
            const doId = this.env.SUPERVISOR.idFromName(operationId);
            const stub = this.env.SUPERVISOR.get(doId);

            const response = await stub.fetch("http://supervisor/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    command: task,
                    repoUrl: repoUrl,
                    payload
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Supervisor error: ${response.status} ${errText}`);
            }

            const result = await response.json();
            return { ...result, operationId };

        } catch (e: any) {
            console.error('[ContainerManager] Manager Failed', e);
            throw e;
        }
    }
}
