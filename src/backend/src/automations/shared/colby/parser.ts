import { z } from 'zod';
import type { ColbyCommandContext, ColbyInvocation } from './contracts';

const RepositorySchema = z.object({
  name: z.string(),
  default_branch: z.string().optional().default('main'),
  owner: z.object({
    login: z.string(),
  }),
});

const InstallationSchema = z
  .object({
    id: z.number(),
  })
  .optional();

const IssueSchema = z
  .object({
    id: z.number().optional(),
    number: z.number(),
    body: z.string().nullable().optional(),
    pull_request: z.unknown().optional(),
  })
  .optional();

const PullRequestSchema = z
  .object({
    id: z.number().optional(),
    number: z.number(),
    body: z.string().nullable().optional(),
  })
  .optional();

const CommentSchema = z
  .object({
    id: z.number().optional(),
    body: z.string().nullable().optional(),
  })
  .optional();

const ReviewSchema = z
  .object({
    id: z.number().optional(),
    body: z.string().nullable().optional(),
  })
  .optional();

const ColbyPayloadSchema = z
  .object({
    repository: RepositorySchema,
    installation: InstallationSchema,
    issue: IssueSchema,
    pull_request: PullRequestSchema,
    comment: CommentSchema,
    review: ReviewSchema,
  })
  .passthrough();

const INVOCATION_PATTERN = /(?:^|\n)\s*(\/colby|@colby)\b(?:\s+([a-z0-9-]+))?(?:\s+([^\n]+))?/i;

export interface ParsedColbyRequest {
  invocation: ColbyInvocation;
  context: Omit<ColbyCommandContext, 'env' | 'executionCtx' | 'octokit'>;
}

function extractInvocation(body: string): ColbyInvocation | null {
  const match = body.match(INVOCATION_PATTERN);
  if (!match) {
    return null;
  }

  const trigger = match[1].startsWith('/') ? 'slash' : 'mention';
  const command = (match[2] || 'help').toLowerCase();
  const args = (match[3] || '').trim();

  return {
    trigger,
    raw: match[0].trim(),
    body,
    command,
    args,
  };
}

function normalizeIssuesContext(eventName: string, parsed: z.infer<typeof ColbyPayloadSchema>) {
  const issueNumber = parsed.issue?.number;
  if (!issueNumber) {
    return null;
  }

  const isComment = eventName === 'issue_comment';
  const body = isComment ? parsed.comment?.body || '' : parsed.issue?.body || '';
  const isPullRequest = Boolean(parsed.issue?.pull_request);
  const commentId = isComment ? parsed.comment?.id : parsed.issue?.id;

  return {
    body,
    thread: {
      kind: isPullRequest ? ('pull_request' as const) : ('issue' as const),
      number: issueNumber,
      isPullRequest,
      commentId,
    },
  };
}

function normalizeReviewCommentContext(parsed: z.infer<typeof ColbyPayloadSchema>) {
  const body = parsed.comment?.body || '';
  const prNumber = parsed.pull_request?.number;
  if (!prNumber) {
    return null;
  }

  return {
    body,
    thread: {
      kind: 'review_comment' as const,
      number: prNumber,
      isPullRequest: true,
      commentId: parsed.comment?.id,
    },
  };
}

function normalizeReviewContext(parsed: z.infer<typeof ColbyPayloadSchema>) {
  const body = parsed.review?.body || '';
  const prNumber = parsed.pull_request?.number;
  if (!prNumber) {
    return null;
  }

  return {
    body,
    thread: {
      kind: 'review' as const,
      number: prNumber,
      isPullRequest: true,
      commentId: parsed.review?.id,
    },
  };
}

export function parseColbyRequest(
  eventName: string,
  action: string | null,
  payload: unknown,
): ParsedColbyRequest | null {
  const parsed = ColbyPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  let normalized:
    | { body: string; thread: ColbyCommandContext['thread'] }
    | null = null;

  if (eventName === 'issues' || eventName === 'issue_comment') {
    normalized = normalizeIssuesContext(eventName, parsed.data);
  } else if (eventName === 'pull_request_review_comment') {
    normalized = normalizeReviewCommentContext(parsed.data);
  } else if (eventName === 'pull_request_review') {
    normalized = normalizeReviewContext(parsed.data);
  }

  if (!normalized || !normalized.body.trim()) {
    return null;
  }

  const invocation = extractInvocation(normalized.body);
  if (!invocation) {
    return null;
  }

  return {
    invocation,
    context: {
      installationId: parsed.data.installation?.id,
      repo: {
        owner: parsed.data.repository.owner.login,
        name: parsed.data.repository.name,
        defaultBranch: parsed.data.repository.default_branch,
      },
      thread: normalized.thread,
      source: {
        eventName,
        action,
      },
    },
  };
}
