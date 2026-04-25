/**
 * @file GithubAgent/methods/repo.ts
 * @description Absorbed from Repo.ts — Repository-scoped webhook processing and events.
 *              Pure functions that receive db/store via DI from the parent agent.
 */

import { desc, notInArray } from 'drizzle-orm';
import { agentSchema, type AgentDb } from '@/db/schemas/agents/stateful';
import { generateUuid } from '@/utils/common';
import type { AgentStateStore } from '@/ai/providers';
import type {
  RepoState,
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

export async function processRepoWebhook(
  db: AgentDb,
  store: AgentStateStore<RepoState>,
  eventType: GitHubEventType,
  payload: GitHubWebhookPayload,
): Promise<void> {
  const repo = getRepository(payload);
  if (!repo) return;

  await store.set({
    ...store.state,
    repoFullName: repo.full_name,
    stats: {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
    },
    lastUpdated: new Date().toISOString(),
    webhookConfigured: true,
  });

  const event = createRepoEvent(eventType, payload);
  if (event) {
    (event as any).repo_name = repo.full_name;
    db.insert(agentSchema.agentEvents).values({
      id: event.id, type: event.type, action: event.action ?? null,
      title: event.title, description: event.description, url: event.url,
      actorLogin: event.actor.login, actorAvatar: event.actor.avatar_url,
      repoName: repo.full_name, timestamp: event.timestamp,
    }).onConflictDoUpdate({
      target: agentSchema.agentEvents.id,
      set: {
        type: event.type, action: event.action ?? null,
        title: event.title, description: event.description, url: event.url,
        actorLogin: event.actor.login, actorAvatar: event.actor.avatar_url,
        repoName: repo.full_name, timestamp: event.timestamp,
      },
    }).run();

    const keepIds = db
      .select({ id: agentSchema.agentEvents.id })
      .from(agentSchema.agentEvents)
      .orderBy(desc(agentSchema.agentEvents.timestamp))
      .limit(100);
    db.delete(agentSchema.agentEvents)
      .where(notInArray(agentSchema.agentEvents.id, keepIds))
      .run();
  }
}

// ── Event Management ────────────────────────────────────────────────────────

export function getRepoEvents(db: AgentDb, limit = 20): StoredEvent[] {
  const rows = db
    .select()
    .from(agentSchema.agentEvents)
    .orderBy(desc(agentSchema.agentEvents.timestamp))
    .limit(limit)
    .all();

  return rows.map((row) => ({
    id: row.id,
    type: row.type as GitHubEventType,
    action: row.action || undefined,
    title: row.title ?? '',
    description: row.description ?? '',
    url: row.url ?? '',
    actor: { login: row.actorLogin ?? '', avatar_url: row.actorAvatar ?? '' },
    repoName: row.repoName || undefined,
    timestamp: row.timestamp,
  }));
}

export async function clearRepoEvents(db: AgentDb, store: AgentStateStore<RepoState>): Promise<void> {
  db.delete(agentSchema.automationRuns).run();
  db.delete(agentSchema.agentEvents).run();
  await store.set({ ...store.state, lastUpdated: new Date().toISOString() });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRepository(payload: GitHubWebhookPayload): GitHubRepository | null {
  if ('repository' in payload && payload.repository) return payload.repository;
  return null;
}

function createRepoEvent(eventType: GitHubEventType, payload: GitHubWebhookPayload): StoredEvent | null {
  const id = generateUuid();
  const timestamp = new Date().toISOString();

  switch (eventType) {
    case 'ping': {
      const p = payload as GitHubPingPayload;
      return { id, type: 'ping', title: 'Webhook configured', description: p.zen, url: p.repository?.html_url || '', actor: { login: p.sender?.login || 'github', avatar_url: p.sender?.avatar_url || '' }, timestamp };
    }
    case 'push': {
      const p = payload as GitHubPushPayload;
      const branch = p.ref.replace('refs/heads/', '');
      const cc = p.commits?.length || 0;
      return { id, type: 'push', title: `Pushed ${cc} commit${cc !== 1 ? 's' : ''} to ${branch}`, description: p.commits?.[0]?.message?.split('\n')[0] || 'No commit message', url: p.commits?.[0]?.url || p.repository.html_url, actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp };
    }
    case 'pull_request': {
      const p = payload as GitHubPullRequestPayload;
      return { id, type: 'pull_request', action: p.action, title: `PR #${p.number}: ${p.pull_request.title}`, description: `${p.action} by ${p.sender.login}`, url: p.pull_request.html_url, actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp };
    }
    case 'issues': {
      const p = payload as GitHubIssuesPayload;
      return { id, type: 'issues', action: p.action, title: `Issue #${p.issue.number}: ${p.issue.title}`, description: `${p.action} by ${p.sender.login}`, url: p.issue.html_url, actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp };
    }
    case 'issue_comment': {
      const p = payload as GitHubIssueCommentPayload;
      return { id, type: 'issue_comment', action: p.action, title: `Comment on #${p.issue.number}`, description: p.comment.body.slice(0, 100) + (p.comment.body.length > 100 ? '...' : ''), url: p.comment.html_url, actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp };
    }
    case 'star': {
      const p = payload as GitHubStarPayload;
      return { id, type: 'star', action: p.action, title: p.action === 'created' ? 'Repository starred' : 'Star removed', description: `by ${p.sender.login}`, url: p.repository.html_url, actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp };
    }
    case 'fork': {
      const p = payload as GitHubForkPayload;
      return { id, type: 'fork', title: 'Repository forked', description: `Forked to ${p.forkee.full_name}`, url: p.forkee.html_url, actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp };
    }
    case 'release': {
      const p = payload as GitHubReleasePayload;
      return { id, type: 'release', action: p.action, title: `Release ${p.release.tag_name}`, description: p.release.name || `${p.action} by ${p.sender.login}`, url: p.release.html_url, actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp };
    }
    case 'installation': {
      const p = payload as GitHubInstallationPayload;
      return { id, type: 'installation', action: p.action, title: `App ${p.action}`, description: `Installation ${p.action} for ${p.installation.account.login}`, url: p.installation.html_url, actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp };
    }
    case 'installation_repositories': {
      const p = payload as GitHubInstallationRepositoriesPayload;
      const count = p.repositories_added.length + p.repositories_removed.length;
      return { id, type: 'installation_repositories', action: p.action, title: 'Repositories updated', description: `${p.action} ${count} repos by ${p.sender.login}`, url: p.installation.account.html_url, actor: { login: p.sender.login, avatar_url: p.sender.avatar_url }, timestamp };
    }
    case 'check_run': {
      const p = payload as any;
      return { id, type: 'check_run', action: p.action, title: `Check Run ${p.check_run?.status ?? p.action}`, description: p.check_run?.output?.title || p.check_run?.name || p.action, url: p.check_run?.html_url || p.repository?.html_url || '', actor: { login: p.sender?.login || 'unknown', avatar_url: p.sender?.avatar_url || '' }, timestamp };
    }
    case 'check_suite': {
      const p = payload as any;
      return { id, type: 'check_suite', action: p.action, title: `Check Suite ${p.check_suite?.status ?? p.action}`, description: p.check_suite?.conclusion || p.action, url: p.check_suite?.html_url || p.repository?.html_url || '', actor: { login: p.sender?.login || 'unknown', avatar_url: p.sender?.avatar_url || '' }, timestamp };
    }
    default:
      return { id, type: eventType, title: `${eventType} event`, description: (payload as any).action || 'No description', url: (payload as any).repository?.html_url || '', actor: { login: (payload as any).sender?.login || 'unknown', avatar_url: (payload as any).sender?.avatar_url || '' }, timestamp };
  }
}
