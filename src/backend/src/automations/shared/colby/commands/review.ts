import { appendSignature } from '@/utils/github/signature';
import type { ColbyCommandDefinition } from '../contracts';

export const ReviewCommand: ColbyCommandDefinition = {
  domain: 'pr',
  name: 'review',
  description: 'Queue a Gemini review for the active pull request.',
  requiresPr: true,
  async execute(_invocation, ctx) {
    const issueComments = await ctx.octokit.rest.issues.listComments({
      owner: ctx.repo.owner,
      repo: ctx.repo.name,
      issue_number: ctx.thread.number,
      per_page: 100,
    });

    const alreadyQueued = issueComments.data.some((comment: { body?: string | null }) =>
      (comment.body || '').includes('/gemini review'),
    );

    if (!alreadyQueued) {
      await ctx.octokit.rest.issues.createComment({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        issue_number: ctx.thread.number,
        body: appendSignature('/gemini review'),
      });
    }

    return {
      type: 'reply',
      body: alreadyQueued
        ? 'A Gemini review is already queued for this pull request.'
        : 'Queued a Gemini review for this pull request.',
    };
  },
};
