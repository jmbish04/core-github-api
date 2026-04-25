import type { ResearchFinding } from "../types";
import type { ResearchAgent } from "../index";
/**
 * GitHub research source. Searches GitHub repositories, issues, PRs,
 * and code for relevant information about a topic.
 *
 * Delegates to GithubAgent.searchCode via getPeerAgent RPC — GithubAgent
 * is the single owner of Octokit access. Do NOT import Octokit here.
 */
export async function searchGithub(
  agent: ResearchAgent,
  query: string,
  repoContext?: { owner: string; repo: string },
): Promise<ResearchFinding[]> {
  try {
    const githubAgent = (agent as any).getPeerAgent((agent as any).env.GITHUB_AGENT);

    const finalQuery = repoContext
      ? `${query} repo:${repoContext.owner}/${repoContext.repo}`
      : query;

    const result = await githubAgent.searchCode(finalQuery, repoContext);

    // searchCode returns { total_count, items: [...] } or just items via @callable
    const items = Array.isArray(result) ? result : (result?.items ?? []);

    return items.map((item: any) => ({
      source: "github" as const,
      title: item.name,
      content: `${item.path} in ${item.repository?.full_name || "unknown"}`,
      url: item.html_url,
      relevanceScore: (item.score || 50) / 100,
    }));
  } catch (err) {
    (agent as any).logger?.warn?.("[ResearchAgent] searchGithub via GithubAgent failed", err);
    return [];
  }
}
