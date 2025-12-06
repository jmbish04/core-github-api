/**
 * @file src/workflows/search.ts
 * @description This file defines the GithubSearchWorkflow, which executes the search and analysis logic directly.
 * @owner AI-Builder
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { OrchestratorAgent } from '../agents/orchestrator';
import { getOctokit } from '../octokit/core';
import { getDb, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import type { Bindings } from '../utils/hono'; // Using Bindings for GITHUB_TOKEN coverage

interface GithubSearchWorkflowParams {
  sessionId: string;
  searchId: number;
  searchTerm: string;
}

// Combine bindings with standard Env interface to ensure we have everything
type WorkflowEnv = Bindings & Env;

export class GithubSearchWorkflow extends WorkflowEntrypoint<WorkflowEnv, GithubSearchWorkflowParams> {

  public async run(event: Readonly<WorkflowEvent<GithubSearchWorkflowParams>>, step: WorkflowStep): Promise<void> {
    const { sessionId, searchId, searchTerm } = event.payload;

    // 1. Execute Search
    // We break this into a step for observability and retries
    const searchResults = await step.do('search-github', async () => {
      const octokit = getOctokit(this.env);
      try {
        const result = await octokit.rest.search.repos({
          q: searchTerm,
          per_page: 5 // Limit to top 5 results as per original logic logic usually implies
        });
        return result.data;
      } catch (error) {
        console.error('GitHub Search failed:', error);
        throw error; // Workflow will retry
      }
    });

    if (!searchResults || !searchResults.items || searchResults.items.length === 0) {
      console.warn(`No search results for term: ${searchTerm}`);
    } else {
      // 2. Analyze Results
      // We iterate through items. 
      // Note: In Workflow, it's often better to do one item per step or batch them.
      // For simplicity, we'll keep the loop inside one step or loop steps. 
      // Let's do one 'analysis-batch' step to avoid too many small steps if the list is long, 
      // but here it is max 5 items.

      await step.do('analyze-and-save', async () => {
        const db = getDb(this.env.DB);
        const analyzedItems = [];

        for (const repo of searchResults.items) {
          // Check for existing analysis
          const existing = await db.select({ id: schema.repoAnalysis.id })
            .from(schema.repoAnalysis)
            .where(
              and(
                eq(schema.repoAnalysis.sessionId, sessionId),
                eq(schema.repoAnalysis.repoFullName, repo.full_name)
              )
            )
            .get(); // .get() is faster for single check

          if (existing) continue;

          // Perform Analysis
          const analysis = await this.analyzeRepository(repo, searchTerm);

          // Persist
          await db.insert(schema.repoAnalysis).values({
            sessionId,
            searchId,
            repoFullName: repo.full_name,
            repoUrl: repo.html_url,
            description: repo.description,
            relevancyScore: analysis.relevancyScore
          });

          analyzedItems.push(repo.full_name);
        }
        return analyzedItems;
      });
    }

    // 3. Update Status & Notify Orchestrator
    await step.do('finalize-search', async () => {
      const db = getDb(this.env.DB);

      // Update search status
      await db.update(schema.searches)
        .set({ status: 'completed' })
        .where(eq(schema.searches.id, searchId));

      // Notify Orchestrator
      // Ensure ORCHESTRATOR binding exists
      if (this.env.ORCHESTRATOR) {
        const id = this.env.ORCHESTRATOR.idFromName('orchestrator');
        const stub = this.env.ORCHESTRATOR.get(id) as DurableObjectStub<OrchestratorAgent>;
        await stub.workflowComplete(searchId);
      } else {
        console.warn('ORCHESTRATOR binding missing, cannot notify completion');
      }
    });
  }

  // Helper method for AI analysis (ported from index.ts)
  private async analyzeRepository(repo: any, searchTerm: string): Promise<{ relevancyScore: number }> {
    const ai = this.env.AI;
    if (!ai) {
      console.warn('AI binding missing, returning default score');
      return { relevancyScore: 0 };
    }

    const analysisSchema = {
      type: "object",
      properties: {
        relevancyScore: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "A score from 0.0 to 1.0, where 1.0 is highly relevant."
        },
        reasoning: {
          type: "string",
          description: "A brief justification for the score."
        }
      },
      required: ["relevancyScore", "reasoning"]
    };

    const reasoningInstructions = `
      You are a GitHub repository analyst. Your task is to rate the relevancy of a repository 
      to a search term on a scale of 0.0 to 1.0.
      Search Term: "${searchTerm}"
      Repository: ${repo.full_name}
      Description: "${repo.description || 'No description provided.'}"
      
      Provide a relevancy score (e.g., 0.8) and a *brief* justification for your score.
      Return only the score and justification.
    `;

    // Step 1: Reasoning
    const gptResponse = await ai.run('@cf/openai/gpt-oss-120b', {
      instructions: reasoningInstructions,
      input: `Rate relevancy for: ${repo.full_name}`,
    });

    const rawAnalysisText = typeof gptResponse === 'string' ? gptResponse : (gptResponse as any).response || '';

    // Step 2: Structuring
    try {
      const structuringSystemPrompt = `
        You are a text standardization assistant. Parse the raw analysis text and return a 
        structured JSON object that *strictly* adheres to the provided JSON schema. 
        Return *only* the valid JSON object.
      `;

      const llamaMessages = [
        { role: "system", content: structuringSystemPrompt },
        { role: "user", content: `Here is the raw text to parse:\n\n${rawAnalysisText}` }
      ];

      const llamaResponse = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: llamaMessages,
        response_format: {
          type: "json_schema",
          json_schema: analysisSchema
        }
      });

      const structuredResponse = JSON.parse((llamaResponse as any).response);

      if (structuredResponse && typeof structuredResponse.relevancyScore === 'number') {
        return { relevancyScore: structuredResponse.relevancyScore };
      }
      return { relevancyScore: 0 };

    } catch (e) {
      console.error(`Failed to parse AI JSON response for ${repo.full_name}:`, e);
      // Fallback regex
      const scoreMatch = rawAnalysisText.match(/(\d\.\d+)/);
      if (scoreMatch && scoreMatch[1]) {
        const score = Number.parseFloat(scoreMatch[1]);
        if (Number.isFinite(score)) return { relevancyScore: score };
      }
      return { relevancyScore: 0 };
    }
  }
}
