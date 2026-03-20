import type { ColbyCommandDefinition } from '../contracts';

export const CodeCommentsCommand: ColbyCommandDefinition = {
  domain: 'pr',
  name: 'code_comments',
  description: 'Replies with a curl command to obtain code comments as JSON without auth required.',
  requiresPr: true,
  execute: async (invocation, ctx) => {
    // Generate the URL for the PR comments
    // The instructions say "url to obtain code comments as json without auth required"
    // Since we don't have the exact host name guaranteed, we can construct it or just use the canonical
    // Assuming 'https://core-github-api.jmbish04.workers.dev' is the host defined for these endpoints
    
    // We can try to extract host from req/ctx if available, but env might not have it directly. 
    // Using standard hostname format for Cloudflare Workers
    const host = ctx.env?.BASE_URL || 'https://core-github-api.hacolby.workers.dev';
    const url = `${host}/api/github/comments/${ctx.repo.owner}/${ctx.repo.name}/pulls/${ctx.thread.number}`;

    const body = `[insert agent here] please fix all code comments. If you're having trouble obtaining the code comments you can view them here \`curl ${url}\``;

    return {
      type: 'reply',
      body,
      skipPrimer: true,
    };
  },
};
