/**
 * @file src/workflows/search.ts
 * @description Executes GitHub search and performs AI analysis using Drizzle ORM for D1.
 * @owner AI-Builder
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { getOctokit } from '@/services/octokit/core';
import { getWebhooksDb } from '@/db';
import { searches, repoAnalysis } from '@/db/schemas/github/webhooks';
import { eq, and, inArray } from 'drizzle-orm';
import type { Bindings } from '@/utils/hono';
import { getAgentByName } from 'agents';

interface GithubSearchWorkflowParams {
  sessionId: string;
  searchId: number;
  searchTerm: string;
}

interface OrchestratorStub {
  workflowComplete(searchId: number): Promise<void>;
}

type WorkflowEnv = Bindings & Env;

export class GithubSearchWorkflow extends WorkflowEntrypoint<WorkflowEnv, GithubSearchWorkflowParams> {

  public async run(event: Readonly<WorkflowEvent<GithubSearchWorkflowParams>>, step: WorkflowStep): Promise<void> {
    const { sessionId, searchId, searchTerm } = event.payload;
    const db = getWebhooksDb(this.env.DB_WEBHOOKS);

    // 1. Execute Search (GitHub API)
    const searchResults = await step.do('search-github', async () => {
      const octokit = await getOctokit(this.env);
      const result = await octokit.rest.search.repos({
        q: searchTerm,
        sort: 'stars',
        per_page: 5
      });
      return result.data.items || [];
    });

    if (searchResults.length === 0) {
      // Update status to failed/completed empty
      await step.do('mark-empty', async () => {
        await db.update(searches)
          .set({ status: 'completed' })
          .where(eq(searches.id, searchId));
      });
      return;
    }

    // 2. Filter & Analyze (Batch Processing)
    await step.do('analyze-and-save', async () => {
      // 2a. Batch Check: Get all existing repos for this session
      const repoNames = searchResults.map(r => r.full_name);

      const existingAnalyses = await db.select({ repoFullName: repoAnalysis.repoFullName })
        .from(repoAnalysis)
        .where(
          and(
            eq(repoAnalysis.sessionId, sessionId),
            inArray(repoAnalysis.repoFullName, repoNames)
          )
        );

      const existingSet = new Set(existingAnalyses.map(e => e.repoFullName));

      // Filter list to only new items
      const reposToAnalyze = searchResults.filter(r => !existingSet.has(r.full_name));

      if (reposToAnalyze.length === 0) return { skipped: true, reason: 'All repos already analyzed' };

      // 2b. Parallel AI Analysis
      const analysisPromises = reposToAnalyze.map(repo =>
        this.analyzeRepository(repo, searchTerm)
          .then(analysis => ({
            sessionId,
            searchId,
            repoFullName: repo.full_name,
            repoUrl: repo.html_url,
            description: repo.description || '',
            relevancyScore: analysis.relevancyScore,
            reasoning: analysis.reasoning
          }))
      );

      const rowsToInsert = await Promise.all(analysisPromises);

      // 2c. Batch Insert into D1
      if (rowsToInsert.length > 0) {
        await db.insert(repoAnalysis).values(rowsToInsert);
      }

      return { processed: rowsToInsert.length };
    });

    // 3. Finalize
    await step.do('finalize-search', async () => {
      // Update local DB status using Drizzle
      await db.update(searches)
        .set({ status: 'completed' })
        .where(eq(searches.id, searchId));

      // Notify Orchestrator
      if (this.env.ORCHESTRATOR) {
        const getByName = getAgentByName as any;
        const stub = await getByName(this.env.ORCHESTRATOR, 'orchestrator') as OrchestratorStub;
        await stub.workflowComplete(searchId);
      }
    });
  }

  // Helper method for AI analysis
  private async analyzeRepository(repo: any, searchTerm: string): Promise<{ relevancyScore: number; reasoning: string }> {
    const ai = this.env.AI;
    // ... (Same optimized AI logic as previous step) ...
    // Re-implementing the AI logic as in the previous version to ensure it works
    if (!ai) {
      console.warn('AI binding missing');
      return { relevancyScore: 0, reasoning: "AI Binding Missing" };
    }

    const systemPrompt = `
      You are a technical analyst evaluating GitHub repositories against a user's search intent.
      
      Search Term: "${searchTerm}"
      
      Evaluate the repository below. Return a JSON object with:
      - relevancyScore: A float between 0.0 and 1.0 (1.0 = Perfect Match).
      - reasoning: A strictly concise sentence justifying the score.
    `;

    const repoDetails = `
      Repo: ${repo.full_name}
      Description: ${repo.description || 'No description'}
      Language: ${repo.language || 'Unknown'}
      Topics: ${repo.topics ? repo.topics.join(', ') : 'None'}
    `;

    try {
      const response = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: repoDetails }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            type: "object",
            properties: {
              relevancyScore: { type: "number" },
              reasoning: { type: "string" }
            },
            required: ["relevancyScore", "reasoning"]
          }
        }
      });

      let result = (response as any);
      if (result.response && typeof result.response === 'string') {
        result = JSON.parse(result.response);
      } else if (typeof result === 'string') {
        result = JSON.parse(result);
      }

      return {
        relevancyScore: result.relevancyScore ?? 0,
        reasoning: result.reasoning ?? "Parsed default"
      };

    } catch (e) {
      console.error(`AI Analysis failed for ${repo.full_name}`, e);
      return { relevancyScore: 0, reasoning: "Analysis Failed" };
    }
  }
}
