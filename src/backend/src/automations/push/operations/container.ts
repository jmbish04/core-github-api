import { createAppAuth } from '@octokit/auth-app';
import { getGitHubAppId, getGitHubPrivateKey } from '@utils/secrets';
import type { ColbyCommandContext } from '@/automations/shared/colby/contracts';

export class ContainerManager {
  constructor(private readonly env: Env) {}

  async executeTask(ctx: ColbyCommandContext, task: string, payload: Record<string, unknown>) {
    if (!ctx.installationId) {
      throw new Error('Container tasks require a GitHub installation id.');
    }

    const auth = createAppAuth({
      appId: await getGitHubAppId(this.env),
      privateKey: await getGitHubPrivateKey(this.env),
      installationId: ctx.installationId,
    });

    const installationAuth = await auth({ type: 'installation' });
    const repoUrl = `https://x-access-token:${installationAuth.token}@github.com/${ctx.repo.owner}/${ctx.repo.name}.git`;
    const operationId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const durableObjectId = this.env.SUPERVISOR.idFromName(operationId);
    const stub = this.env.SUPERVISOR.get(durableObjectId);

    const response = await stub.fetch('http://supervisor/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: task,
        repoUrl,
        payload,
      }),
    });

    if (!response.ok) {
      throw new Error(`Supervisor error: ${response.status} ${await response.text()}`);
    }

    const result = (await response.json()) as Record<string, unknown>;
    return { ...result, operationId };
  }
}
