import { createAppAuth } from '@octokit/auth-app';
import { getGitHubAppId, getGitHubPrivateKey } from '@utils/secrets';
import type { ColbyCommandContext } from '@/automations/shared/colby/contracts';
import { getSandbox } from '@cloudflare/sandbox';
import { getSandboxOptions } from '@/ai/utils/sandbox';

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
    const operationId = `op-${Date.now()}-${crypto.randomUUID()}`;
    
    const options = await getSandboxOptions(this.env);
    const sandbox = getSandbox((this.env as any).SANDBOX, operationId, options);

    try {
      await sandbox.gitCheckout(repoUrl, { targetDir: 'repo' });
      if (Object.keys(payload).length > 0) {
        await sandbox.writeFile('/tmp/payload.json', JSON.stringify(payload));
      }

      const execResult = await sandbox.exec(`cd /workspace/repo && ${task}`);

      if (!execResult.success) {
        throw new Error(`Supervisor error: ${execResult.exitCode} ${execResult.stderr}`);
      }

      return {
        success: execResult.success,
        stdout: execResult.stdout,
        stderr: execResult.stderr,
        operationId,
      };
    } finally {
      await sandbox.destroy();
    }
  }
}
