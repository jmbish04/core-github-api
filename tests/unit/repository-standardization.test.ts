import { describe, expect, it } from 'vitest';
import { RepoStandardization } from '@/automations/repository/standardization';

function createAutomation(eventName: string, action: string | null, payload: any) {
  return new RepoStandardization({
    env: {} as Env,
    payload,
    deliveryId: 'delivery-id',
    eventName,
    action,
    installationId: 1,
  });
}

describe('RepoStandardization.shouldRun', () => {
  it('runs for repository events with repository payload', async () => {
    const automation = createAutomation('repository', 'created', {
      repository: {
        name: 'core-workersai-proxy',
        owner: { login: 'jmbish04' },
      },
    });

    await expect(automation.shouldRun()).resolves.toBe(true);
  });

  it('runs for installation_repositories added events with repositories_added', async () => {
    const automation = createAutomation('installation_repositories', 'added', {
      repositories_added: [{ name: 'core-workersai-proxy', full_name: 'jmbish04/core-workersai-proxy' }],
    });

    await expect(automation.shouldRun()).resolves.toBe(true);
  });

  it('skips installation_repositories removed events', async () => {
    const automation = createAutomation('installation_repositories', 'removed', {
      repositories_added: [{ name: 'core-workersai-proxy', full_name: 'jmbish04/core-workersai-proxy' }],
    });

    await expect(automation.shouldRun()).resolves.toBe(false);
  });
});
