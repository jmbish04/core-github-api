/**
 * @file src/agents/orchestrator.ts
 * @description This file defines the OrchestratorAgent, which is responsible for
 * managing the entire workflow of a user's request.
 * @owner AI-Builder
 */

import { Agent } from 'agents'
import { Ai } from '@cloudflare/ai'
import { GithubSearchWorkflow } from '../workflows/search'

export class OrchestratorAgent extends Agent {
  ai: Ai

  constructor(ctx, env) {
    super(ctx, env)
    this.ai = new Ai(env.AI)
  }

  async start(prompt: string) {
    const sessionId = crypto.randomUUID()
    const searchIds = []

    // 1. Persist the session to D1
    await this.env.DB.prepare(
      'INSERT INTO sessions (session_id, prompt) VALUES (?, ?)'
    ).bind(sessionId, prompt).run()

    // 2. Generate search terms
    const searchTerms = await this.generateSearchTerms(prompt)

    // 3. Launch a workflow for each search term
    for (const searchTerm of searchTerms) {
      const search = await this.env.DB.prepare(
        'INSERT INTO searches (session_id, search_term) VALUES (?, ?)'
      ).bind(sessionId, searchTerm).run()
      const searchId = search.meta.last_row_id
      searchIds.push(searchId)

      await GithubSearchWorkflow(this.env.GITHUB_SEARCH_WORKFLOW).run(
        sessionId,
        searchId,
        searchTerm
      )
    }

    // 4. Store the list of pending search IDs
    await this.ctx.storage.put('pendingSearches', searchIds)

    return { sessionId }
  }

  async getStatus(sessionId: string) {
    const pendingSearches = await this.ctx.storage.get('pendingSearches')

    if (pendingSearches && pendingSearches.length > 0) {
      return { status: 'pending', results: [] }
    }

    const { results } = await this.env.DB.prepare(
      'SELECT * FROM repo_analysis WHERE session_id = ? ORDER BY relevancy_score DESC LIMIT 10'
    ).bind(sessionId).all()
    return { status: 'completed', results }
  }

  async workflowComplete(searchId: number) {
    let pendingSearches = await this.ctx.storage.get('pendingSearches')
    if (pendingSearches) {
      pendingSearches = pendingSearches.filter((id) => id !== searchId)
      await this.ctx.storage.put('pendingSearches', pendingSearches)
    }
  }

  async generateSearchTerms(prompt: string): Promise<string[]> {
    const response = await this.ai.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt: `Given the following prompt, generate up to 5 diverse and relevant GitHub search queries: "${prompt}"`,
    })

    // For simplicity, we'll just split the response by newlines.
    // In a real-world scenario, you'd want to use a more robust parsing method.
    return response.response.split('\n').filter(term => term.trim() !== '').slice(0, 5)
  }
}
