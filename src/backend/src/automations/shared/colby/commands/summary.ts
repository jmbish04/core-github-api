import { generateText } from '@/ai/providers';
import type { ColbyCommandDefinition } from '../contracts';

function truncate(value: string, limit = 4000): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}\n...`; 
}

function joinLines(lines: string[]): string {
  return lines.filter(Boolean).join('\n');
}

export const SummaryCommand: ColbyCommandDefinition = {
  domain: 'pr',
  name: 'summary',
  description: 'Summarize the current pull request state.',
  requiresPr: true,
  async execute(_invocation, ctx) {
    const pullRequest = await ctx.octokit.rest.pulls.get({
      owner: ctx.repo.owner,
      repo: ctx.repo.name,
      pull_number: ctx.thread.number,
    });

    const [files, issueComments, reviewComments, checks] = await Promise.all([
      ctx.octokit.rest.pulls.listFiles({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        pull_number: ctx.thread.number,
        per_page: 100,
      }),
      ctx.octokit.rest.issues.listComments({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        issue_number: ctx.thread.number,
        per_page: 20,
      }),
      ctx.octokit.rest.pulls.listReviewComments({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        pull_number: ctx.thread.number,
        per_page: 20,
      }),
      ctx.octokit.rest.checks.listForRef({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        ref: pullRequest.data.head.sha,
        per_page: 20,
      }),
    ]);

    const fileSummary = files.data
      .slice(0, 40)
      .map((file: { filename: string; status?: string; additions?: number; deletions?: number }) =>
        `- ${file.filename} (${file.status || 'modified'}, +${file.additions || 0}/-${file.deletions || 0})`,
      );

    const cleanIssueComments = issueComments.data
      .filter((comment: { body?: string | null }) => {
        const body = comment.body || '';
        return body && !body.includes('Using Core Github Slash Commands (/colby)');
      })
      .slice(-10)
      .map((comment: { user?: { login?: string }; body?: string | null }) =>
        `- ${comment.user?.login || 'unknown'}: ${truncate(comment.body || '', 400)}`,
      );

    const cleanReviewComments = reviewComments.data
      .slice(-10)
      .map((comment: { user?: { login?: string }; path?: string; body?: string | null }) =>
        `- ${comment.user?.login || 'unknown'} on ${comment.path || 'unknown file'}: ${truncate(comment.body || '', 300)}`,
      );

    const checkSummary = checks.data.check_runs
      .slice(0, 20)
      .map((check: { name?: string; conclusion?: string | null; status?: string }) =>
        `- ${check.name || 'unknown'}: ${check.conclusion || check.status || 'pending'}`,
      );

    const systemPrompt = `You are Colby, a pull request summarization assistant. Produce concise markdown that helps a reviewer understand the current state of a pull request. Include the likely intent, key file changes, open risks, and the current CI/review state. Avoid fluff.`;

    const prompt = joinLines([
      `Repository: ${ctx.repo.owner}/${ctx.repo.name}`,
      `Pull Request #${ctx.thread.number}`,
      `Title: ${pullRequest.data.title}`,
      `State: ${pullRequest.data.state}`,
      `Author: ${pullRequest.data.user?.login || 'unknown'}`,
      '',
      'Pull Request Body:',
      truncate(pullRequest.data.body || 'No description provided.', 3000),
      '',
      'Changed Files:',
      fileSummary.join('\n') || '- No changed files found.',
      '',
      'Recent Issue Comments:',
      cleanIssueComments.join('\n') || '- No recent issue comments.',
      '',
      'Recent Review Comments:',
      cleanReviewComments.join('\n') || '- No recent review comments.',
      '',
      'Latest Check Runs:',
      checkSummary.join('\n') || '- No check runs found.',
    ]);

    const summary = await generateText(ctx.env, prompt, systemPrompt, {
      maxTokens: 1200,
      effort: 'medium',
    });

    return {
      type: 'reply',
      body: `## Pull Request Summary\n\n${summary.trim()}`,
    };
  },
};
