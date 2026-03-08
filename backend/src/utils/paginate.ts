/**
 * @file src/utils/paginate.ts
 * @description Provides utilities for handling paginated responses securely from the GitHub Octokit API.
 * @owner AI-Builder
 */

import { Octokit } from "@octokit/rest";

/**
 * A generic async generator to iterate through all pages of an Octokit rest endpoint response.
 * This is memory efficient for extremely large payloads.
 * 
 * @param octokit The authenticated Octokit instance.
 * @param route The GitHub API route string.
 * @param parameters Any parameters dictating the route.
 */
export async function* paginateStream<T>(
  octokit: Octokit,
  route: string,
  parameters?: Record<string, any>
): AsyncGenerator<T, void, unknown> {
  const iterator = octokit.paginate.iterator(route as any, parameters || {});
  
  for await (const response of iterator) {
    if (Array.isArray(response.data)) {
      for (const item of response.data) {
        yield item as T;
      }
    }
  }
}

/**
 * Fetches all pages of GitHub results greedily and returns the aggregated array.
 * Wraps Octokit's built-in pagination extension.
 * 
 * @param octokit The authenticated Octokit instance.
 * @param route The GitHub API route string.
 * @param parameters Any parameters dictating the route.
 */
export const paginate = async <T = any>(
  octokit: Octokit, 
  route: string, 
  parameters?: Record<string, any>
): Promise<T[]> => {
  return await octokit.paginate(route as any, parameters) as T[];
};
