/**
 * @file src/workflows/search.ts
 * @description This file defines the GithubSearchWorkflow, which is responsible for
 * enqueuing a search task.
 * @owner AI-Builder
 */

import { workflow } from 'cloudflare:workflows'

export const GithubSearchWorkflow = workflow(
  async (sessionId: string, searchId: number, searchTerm: string) => {
    await workflow.enqueue('SEARCH_QUEUE', {
      sessionId,
      searchId,
      searchTerm,
    })
  }
)
