/**
 * @file src/agents/orchestrator.ts
 * @description This file defines the OrchestratorAgent, which is responsible for
 * managing the entire workflow of a user's request.
 * @owner AI-Builder
 */

import { Agent } from 'agents'
import { getDb, schema } from '../db'
import { eq, desc } from 'drizzle-orm'
// No longer need a direct import of the workflow class to call it

export class OrchestratorAgent extends Agent {
  constructor(ctx, env) {
    super(ctx, env)
  }

  async start(prompt: string) {
    const sessionId = crypto.randomUUID()
    const searchIds = []
    const db = getDb(this.env.DB)

    // 1. Persist the session to D1
    await db.insert(schema.sessions).values({
      sessionId,
      prompt
    })

    // 2. Generate search terms
    const searchTerms = await this.generateSearchTerms(prompt)

    // 3. Launch a workflow for each search term
    for (const searchTerm of searchTerms) {
      const search = await db.insert(schema.searches).values({
        sessionId,
        searchTerm
      }).returning({ id: schema.searches.id })

      const searchId = search[0].id
      searchIds.push(searchId)

      // Use the binding's .create() method to start the workflow
      await this.env.GITHUB_SEARCH_WORKFLOW.create({
        id: `search-${searchId}`, // Use searchId for idempotency
        params: {
          sessionId,
          searchId,
          searchTerm
        }
      });
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

    const db = getDb(this.env.DB)
    const results = await db.select()
      .from(schema.repoAnalysis)
      .where(eq(schema.repoAnalysis.sessionId, sessionId))
      .orderBy(desc(schema.repoAnalysis.relevancyScore))
      .limit(10)
      .all()

    return { status: 'completed', results }
  }

  async workflowComplete(searchId: number) {
    let pendingSearches = await this.ctx.storage.get('pendingSearches')
    if (pendingSearches) {
      pendingSearches = pendingSearches.filter((id) => id !== searchId)
      await this.ctx.storage.put('pendingSearches', pendingSearches)
    }
  }

  /**
   * This is the function you're asking about.
   * It implements the two-step AI chain.
   */
  async generateSearchTerms(prompt: string): Promise<string[]> {
    
    // --- Step 1: Reasoning with @cf/openai/gpt-oss-120b ---
    const gptInstructions = ```
      You are an expert GitHub search query generator. 
      You will be given a natural language prompt and must generate up to 5 diverse and relevant GitHub search queries. 
      Return *only* the queries, each on a new line.
    ```;
    
    const gptResponse = await this.env.AI.run('@cf/openai/gpt-oss-120b', {
      instructions: gptInstructions,
      input: prompt,
    });

    const rawQueryText = typeof gptResponse === 'string' ? gptResponse : (gptResponse as any).response || '';

    try {
      // --- Step 2: Structuring with @cf/meta/llama-3.3-70b-instruct-fp8-fast ---
      
      // Define the JSON schema Llama 3.3 must adhere to
      const searchQueriesSchema = {
        type: "object",
        properties: {
          queries: {
            type: "array",
            items: {
              type: "string",
              description: "A single GitHub search query."
            },
            description: "A list of generated GitHub search queries."
          }
        },
        required: ["queries"]
      };

      // Create the prompt for Llama 3.3, telling it to parse the raw text
      const llamaSystemPrompt = ```
        You are a text standardization assistant. 
        Your task is to parse a raw text input containing a list of GitHub search queries 
        and return them as a structured JSON object that *strictly* adheres to the provided JSON schema. 
        Return *only* the valid JSON object.
      ```;
      
      const llamaMessages = [
        { role: "system", content: llamaSystemPrompt },
        { role: "user", content: `Here is the raw text:\n\n${rawQueryText}` }
      ];

      // Execute the Llama 3.3 model, passing the schema in 'response_format'
      const llamaResponse = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: llamaMessages,
        response_format: { 
          type: "json_schema", // Specify the type
          json_schema: searchQueriesSchema // Provide the schema
        }
      });
      // --- End of AI calls ---

      // The response from Llama 3.3 will be an object, with the JSON *string* in the 'response' property
      const structuredResponse = JSON.parse((llamaResponse as any).response);

      // Validate the structure and return
      if (structuredResponse && Array.isArray(structuredResponse.queries)) {
        return structuredResponse.queries
          .filter((q: any) => typeof q === 'string' && q.trim() !== '')
          .slice(0, 5);
      }
      
      // If JSON is valid but structure is wrong, fall back to raw parsing
      console.warn('Llama 3.3 response did not match expected schema:', (llamaResponse as any).response);
      return rawQueryText.split('\n').filter(term => term.trim() !== '' && !term.startsWith('Here are')).slice(0, 5);

    } catch (e) {
      // Fallback: If Llama 3.3 fails (e.g., parsing error), just use the raw text from gpt-oss-120b
      console.error('Failed to parse Llama 3.3 JSON response, falling back to raw text parsing:', e);
      return rawQueryText.split('\n').filter(term => term.trim() !== '' && !term.startsWith('Here are')).slice(0, 5);
    }
  }
}
