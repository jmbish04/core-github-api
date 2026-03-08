/**
 * @file backend/src/automations/push/ops/container.ts
 * @description Orchestrates Cloudflare Containers for push automation tasks.
 */

import { createAppAuth } from '@octokit/auth-app';
import { getGitHubAppId, getGitHubPrivateKey } from '@utils/secrets';
import type { PushContext } from '../fixers/worker_types';

export class ContainerManager {
    constructor(private env: any) { } // using any for env momentarily to avoid type hassles with dynamic binding

    /**
     * Executes a task in the centralized container.
     */
    async executeTask(ctx: PushContext, task: string, payload: any) {
        console.log(`[ContainerManager] Preparing to execute '${task}'...`);

        if (!ctx.installationId) {
            throw new Error("Container tasks require a GitHub installation id.");
        }

        let token = "";
        try {
            const auth = createAppAuth({
                appId: await getGitHubAppId(this.env),
                privateKey: await getGitHubPrivateKey(this.env),
                installationId: ctx.installationId,
            });

            const installationAuth = await auth({ type: 'installation' });
            token = installationAuth.token;
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
