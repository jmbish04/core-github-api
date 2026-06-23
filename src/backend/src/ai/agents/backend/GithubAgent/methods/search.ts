/**
 * @file GithubAgent/methods/search.ts
 * @description GitHub search operations exposed as @callable RPC surface.
 *              Uses Octokit internally — all external consumers access via
 *              getPeerAgent(env.GITHUB_AGENT).searchRepositories(...).
 */
import { Octokit } from "@octokit/rest";
import { getGithubToken } from "@/utils/secrets";

export interface SearchReposArgs {
  query: string;
  perPage?: number;
  page?: number;
}

/**
 * Search GitHub repositories. Returns raw Octokit `search.repos` response items.
 */
export async function searchRepositoriesImpl(
  env: Env,
  args: SearchReposArgs,
): Promise<any[]> {
  const ghToken = await getGithubToken(env);
  const octokit = new Octokit({ auth: ghToken });
  const { data } = await octokit.search.repos({
    q: args.query,
    per_page: args.perPage ?? 20,
    page: args.page ?? 1,
  });
  return data.items;
}
