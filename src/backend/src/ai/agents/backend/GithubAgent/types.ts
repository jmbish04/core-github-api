/**
 * @file GithubAgent/types.ts
 * @description Canonical type re-exports and GithubAgent-specific state types.
 *              All GitHub webhook types originate from @/types/github/webhooks.
 */

import type { PersistentAgentState } from '@/ai/providers';

export type {
  GitHubEventType,
  GitHubForkPayload,
  GitHubIssueCommentPayload,
  GitHubIssuesPayload,
  GitHubPingPayload,
  GitHubPullRequestPayload,
  GitHubPushPayload,
  GitHubReleasePayload,
  GitHubRepository,
  GitHubStarPayload,
  GitHubWebhookPayload,
  GitHubInstallationPayload,
  GitHubInstallationRepositoriesPayload,
  StoredEvent,
} from '@/types/github/webhooks';

// ── Owner State ─────────────────────────────────────────────────────────────

export type OwnerState = PersistentAgentState & {
  ownerName: string;
  stats: {
    totalStars: number;
    totalForks: number;
    totalOpenIssues: number;
    repoCount: number;
  };
  lastUpdated: string | null;
  webhookConfigured: boolean;
};

// ── Repo State ──────────────────────────────────────────────────────────────

export type RepoState = PersistentAgentState & {
  repoFullName: string;
  stats: {
    stars: number;
    forks: number;
    openIssues: number;
  };
  lastUpdated: string | null;
  webhookConfigured: boolean;
};

// ── PR Review Task ──────────────────────────────────────────────────────────

import { z } from 'zod';

export const PrReviewTaskSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  pullNumber: z.number(),
  title: z.string().optional(),
  branch: z.string().default('main'),
});

export type PrReviewTask = z.infer<typeof PrReviewTaskSchema>;
