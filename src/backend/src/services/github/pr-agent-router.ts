export interface GitHubAuthor {
  login: string;
}

export interface GitHubComment {
  id: string;
  author: GitHubAuthor;
  body: string;
  createdAt: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  comments: GitHubComment[];
}

export type AgentType = 'google-labs-jules' | 'copilot' | 'unassigned';

/**
 * Fetches a GitHub Pull Request via the Octokit client and determines the assigned agent
 * based on mentions in the PR body or comments.
 */
export class PullRequestAgentRouter {
  
  /**
   * Fetches the PR and comments using the provided octokit client.
   * Adapted for Cloudflare Workers (replaces execSync node:child_process).
   */
  public static async fetchPRData(octokit: any, owner: string, repo: string, prNumber: number): Promise<GitHubPR> {
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Fetch up to 100 recent comments
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    return {
      number: pr.number,
      title: pr.title,
      body: pr.body || '',
      state: pr.state,
      url: pr.html_url,
      comments: comments.map((c: any) => ({
        id: c.id.toString(),
        author: { login: c.user?.login || '' },
        body: c.body || '',
        createdAt: c.created_at,
      })),
    };
  }

  /**
   * Parses the PR payload to find specific agent mentions.
   * Prioritizes the most recent comment, falling back to the PR body.
   */
  public static determineAssignedAgent(pr: GitHubPR): AgentType {
    // Combine PR body with all comment bodies, ordering from newest to oldest 
    // to ensure the most recent command takes precedence over older ones.
    const allTextBlocks = [
      ...[...pr.comments].reverse().map((c: GitHubComment) => c.body),
      pr.body
    ];

    for (const text of allTextBlocks) {
      if (!text) continue;
      
      const normalizedText = text.toLowerCase();
      
      // Look for both the official GitHub login and the shorthand trigger
      if (normalizedText.includes('@google-labs-jules') || normalizedText.includes('@jules')) {
        return 'google-labs-jules';
      }
      
      if (normalizedText.includes('mention @copilot') || normalizedText.includes('@copilot')) {
        return 'copilot';
      }
    }

    return 'unassigned';
  }

  /**
   * Convenience method to fetch and route in one step.
   */
  public static async routePR(octokit: any, owner: string, repo: string, prNumber: number): Promise<{ pr: GitHubPR; agent: AgentType }> {
    const pr = await this.fetchPRData(octokit, owner, repo, prNumber);
    const agent = this.determineAssignedAgent(pr);
    return { pr, agent };
  }
}
