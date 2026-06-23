/**
 * @file GithubAgent/methods/owner.ts
 * @description Absorbed from Owner.ts — Organization/owner webhook processing and stats.
 *              Pure functions that receive db/store via DI from the parent agent.
 */

import { desc, notInArray } from 'drizzle-orm';
import { agentSchema, type AgentDb } from '@/db/schemas/agents/stateful';
import { generateUuid } from '@/utils/common';
import type { AgentStateStore } from '@/ai/providers';
// Single-source import — AgentStateStore type re-exported from @/ai/providers
import type {
  OwnerState,
  GitHubEventType,
  GitHubWebhookPayload,
  GitHubRepository,
  GitHubPingPayload,
  GitHubPushPayload,
  GitHubPullRequestPayload,
  GitHubIssuesPayload,
  GitHubIssueCommentPayload,
  GitHubStarPayload,
  GitHubForkPayload,
  GitHubReleasePayload,
  GitHubInstallationPayload,
  GitHubInstallationRepositoriesPayload,
  StoredEvent,
} from '../types';

// ── Webhook Processing ──────────────────────────────────────────────────────

export async function processOwnerWebhook(
  db: AgentDb,
  store: AgentStateStore<OwnerState>,
  eventType: GitHubEventType,
  payload: GitHubWebhookPayload,
): Promise<void> {
  const repo = getRepository(payload);

  const ownerName =
    repo?.owner.login ||
    (payload as any).installation?.account?.login ||
    (payload as any).sender?.login;

  if (ownerName && store.state.ownerName !== ownerName) {
    await store.set({ ...store.state, ownerName });
  }

  await store.set({
    ...store.state,
    lastUpdated: new Date().toISOString(),
    webhookConfigured: true,
  });

  const event = createOwnerEvent(eventType, payload);
  if (event) {
    const repoName = repo?.full_name || (payload as any).repository?.full_name || '';

    db.insert(agentSchema.agentEvents)
      .values({
        id: event.id,
        type: event.type,
        action: event.action ?? null,
        title: event.title,
        description: event.description,
        url: event.url,
        actorLogin: event.actor.login,
        actorAvatar: event.actor.avatar_url,
        repoName,
        timestamp: event.timestamp,
      })
      .onConflictDoUpdate({
        target: agentSchema.agentEvents.id,
        set: {
          type: event.type,
          action: event.action ?? null,
          title: event.title,
          description: event.description,
          url: event.url,
          actorLogin: event.actor.login,
          actorAvatar: event.actor.avatar_url,
          repoName,
          timestamp: event.timestamp,
        },
      })
      .run();

    // Keep only latest 200 events
    const keepIds = db
      .select({ id: agentSchema.agentEvents.id })
      .from(agentSchema.agentEvents)
      .orderBy(desc(agentSchema.agentEvents.timestamp))
      .limit(200);
    db.delete(agentSchema.agentEvents)
      .where(notInArray(agentSchema.agentEvents.id, keepIds))
      .run();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRepository(payload: GitHubWebhookPayload): GitHubRepository | null {
  if ('repository' in payload && payload.repository) return payload.repository;
  return null;
}

function createOwnerEvent(
  eventType: GitHubEventType,
  payload: GitHubWebhookPayload,
): StoredEvent | null {
  const id = generateUuid();
  const timestamp = new Date().toISOString();

  const getRepoPrefix = () => {
    const repo = getRepository(payload);
    return repo ? `[${repo.name}] ` : '';
  };

  switch (eventType) {
    case 'ping': {
      const p = payload as GitHubPingPayload;
      return {
        id, type: 'ping', title: `${getRepoPrefix()}Webhook configured`,
        description: p.zen, url: p.repository?.html_url || '',
        actor: { login: p.sender?.login || 'github', avatar_url: p.sender?.avatar_url || '' },
        timestamp,
      };
    }
    case 'push': {
      const p = payload as GitHubPushPayload;
      const branch = p.ref.replace('refs/heads/', '');
      const commitCount = p.commits?.length || 0;
      return {
        id, type: 'push',
        title: `${getRepoPrefix()}Pushed ${commitCount} commit${commitCount !== 1 ? 's' : ''} to ${branch}`,
        description: p.commits?.[0]?.message?.split('\n')[0] || 'No commit message',
        url: p.commits?.[0]?.url || p.repository.html_url,
        actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
        timestamp,
      };
    }
    case 'pull_request': {
      const p = payload as GitHubPullRequestPayload;
      return {
        id, type: 'pull_request', action: p.action,
        title: `${getRepoPrefix()}PR #${p.number}: ${p.pull_request.title}`,
        description: `${p.action} by ${p.sender.login}`,
        url: p.pull_request.html_url,
        actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
        timestamp,
      };
    }
    case 'issues': {
      const p = payload as GitHubIssuesPayload;
      return {
        id, type: 'issues', action: p.action,
        title: `${getRepoPrefix()}Issue #${p.issue.number}: ${p.issue.title}`,
        description: `${p.action} by ${p.sender.login}`,
        url: p.issue.html_url,
        actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
        timestamp,
      };
    }
    case 'issue_comment': {
      const p = payload as GitHubIssueCommentPayload;
      return {
        id, type: 'issue_comment', action: p.action,
        title: `${getRepoPrefix()}Comment on #${p.issue.number}`,
        description: p.comment.body.slice(0, 100) + (p.comment.body.length > 100 ? '...' : ''),
        url: p.comment.html_url,
        actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
        timestamp,
      };
    }
    case 'star': {
      const p = payload as GitHubStarPayload;
      return {
        id, type: 'star', action: p.action,
        title: `${getRepoPrefix()}${p.action === 'created' ? 'Repository starred' : 'Star removed'}`,
        description: `by ${p.sender.login}`,
        url: p.repository.html_url,
        actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
        timestamp,
      };
    }
    case 'fork': {
      const p = payload as GitHubForkPayload;
      return {
        id, type: 'fork',
        title: `${getRepoPrefix()}Repository forked`,
        description: `Forked to ${p.forkee.full_name}`,
        url: p.forkee.html_url,
        actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
        timestamp,
      };
    }
    case 'release': {
      const p = payload as GitHubReleasePayload;
      return {
        id, type: 'release', action: p.action,
        title: `${getRepoPrefix()}Release ${p.release.tag_name}`,
        description: p.release.name || `${p.action} by ${p.sender.login}`,
        url: p.release.html_url,
        actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
        timestamp,
      };
    }
    case 'installation': {
      const p = payload as GitHubInstallationPayload;
      return {
        id, type: 'installation', action: p.action,
        title: `App ${p.action}`,
        description: `Installation ${p.action} for ${p.installation.account.login}`,
        url: p.installation.html_url,
        actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
        timestamp,
      };
    }
    case 'installation_repositories': {
      const p = payload as GitHubInstallationRepositoriesPayload;
      const count = p.repositories_added.length + p.repositories_removed.length;
      return {
        id, type: 'installation_repositories', action: p.action,
        title: `Repositories updated`,
        description: `${p.action} ${count} repos by ${p.sender.login}`,
        url: p.installation.account.html_url,
        actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
        timestamp,
      };
    }
    case 'check_run': {
      const p = payload as any;
      return {
        id, type: 'check_run', action: p.action,
        title: `${getRepoPrefix()}Check Run ${p.check_run.status}`,
        description: p.check_run.output?.title || p.check_run.name,
        url: p.check_run.html_url,
        actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
        timestamp,
      };
    }
    case 'check_suite': {
      const p = payload as any;
      return {
        id, type: 'check_suite', action: p.action,
        title: `${getRepoPrefix()}Check Suite ${p.check_suite.status}`,
        description: p.check_suite.conclusion || p.action,
        url: p.check_suite.html_url || p.repository?.html_url,
        actor: { login: p.sender.login, avatar_url: p.sender.avatar_url },
        timestamp,
      };
    }
    default:
      return {
        id, type: eventType,
        title: `${getRepoPrefix()}${eventType}`,
        description: (payload as any).action || 'No description',
        url: (payload as any).repository?.html_url || '',
        actor: { login: (payload as any).sender?.login || 'unknown', avatar_url: (payload as any).sender?.avatar_url || '' },
        timestamp,
      };
  }
}
