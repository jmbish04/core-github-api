import type { JulesError } from '@google/jules-sdk';
import { getDb } from '@db';
import { julesSessions } from '@/db/schemas/agents/jules';
import { eq } from 'drizzle-orm';

/**
 * Parses files from the changeSet format returned by Jules
 */
function parseChangeSet(text?: string | null): { filename: string; content: string }[] {
  if (!text) return [];
  const files: { filename: string; content: string }[] = [];
  const parts = text.split("## File: ");
  // Skip the first empty part if text starts with "## File: "
  for (let i = 1; i < parts.length; i++) {
    const section = parts[i];
    const newlineIdx = section.indexOf("\n");
    if (newlineIdx !== -1) {
      const filename = section.substring(0, newlineIdx).trim();
      const content = section.substring(newlineIdx + 1).trim();
      files.push({ filename, content });
    }
  }
  return files;
}
export class JulesService {
  private static instance: JulesService;
  
  private constructor(private env: Env) {}

  public static getInstance(env: Env): JulesService {
    if (!JulesService.instance) {
      JulesService.instance = new JulesService(env);
    }
    return JulesService.instance;
  }

  private async getClient() {
    const { jules } = await import('@google/jules-sdk');
    // In Cloudflare Workers, we must pass the API key explicitly
    // as process.env is not available
    const apiKey = await this.env.JULES_API_KEY.get();
    if (!apiKey) {
      console.warn('JULES_API_KEY is not set in environment bindings');
      // If we don't have a key, we return the default client and hope 
      // the environment has it set via other means (e.g. process.env shim)
      return jules;
    }
    return jules.with({ apiKey });
  }

  /**
   * Start a new Jules session
   */
  async startSession(params: {
    prompt: string;
    repo?: { owner: string; repo: string; branch?: string };
    autoPr?: boolean;
    sessionId?: string;
  }) {
    try {
      const client = await this.getClient();
      const options: any = {
        prompt: params.prompt,
        autoPr: params.autoPr
      };

      if (params.sessionId) {
        options.id = params.sessionId;
      }

      if (params.repo) {
        options.source = {
          github: `${params.repo.owner}/${params.repo.repo}`,
          baseBranch: params.repo.branch || 'main'
        };
      }

      console.log(`[JulesService] Starting session with prompt: ${params.prompt.substring(0, 50)}...`);
      
      let session;
      try {
        session = await client.session(options);
      } catch (sessionError: any) {
        if (sessionError?.message?.includes("SourceNotFoundError") || sessionError?.name === "SourceNotFoundError") {
          console.warn(`[JulesService] Source not found for ${params.repo?.owner}/${params.repo?.repo}. Repository may be private or Jules app not installed. Retrying without source...`);
          delete options.source;
          options.autoPr = false;
          session = await client.session(options);
        } else {
          throw sessionError;
        }
      }

      console.log(`[JulesService] Session created: ${session.id}`);

      // Track session in D1
      try {
        const db = getDb(this.env.DB);
        const now = new Date();
        await db.insert(julesSessions).values({
          id: session.id,
          prompt: params.prompt,
          repoOwner: params.repo?.owner,
          repoName: params.repo?.repo,
          branch: params.repo?.branch || 'main',
          status: 'active',
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
        }).onConflictDoNothing(); 
      } catch (dbError) {
        console.error('[JulesService] Failed to track session in D1:', dbError);
      }

      return session;
    } catch (error) {
      console.error('[JulesService] Start Session Error:', error);
      throw error;
    }
  }

  /**
   * Get an existing session by ID
   */
  async getSession(sessionId: string) {
    const client = await this.getClient();
    return client.session(sessionId);
  }

  /**
   * Stream activities from a session
   * Returns an AsyncIterable
   */
  async streamSession(sessionId: string) {
    const session = await this.getSession(sessionId);
    
    // Update activity timestamp in background
    this.updateSessionActivity(sessionId).catch(err => 
      console.error(`[JulesService] Failed to update activity for ${sessionId}`, err)
    );

    return session.stream();
  }

  private async updateSessionActivity(sessionId: string, status?: 'active' | 'completed' | 'failed') {
    try {
       const db = getDb(this.env.DB);
       const updateData: any = {
         lastActivityAt: new Date(),
         updatedAt: new Date()
       };
       if (status) {
         updateData.status = status;
       }
       await db.update(julesSessions)
         .set(updateData)
         .where(eq(julesSessions.id, sessionId));
    } catch (error) {
       console.error(`[JulesService] DB update failed for ${sessionId}`, error);
    }
  }
  
  /**
   * Run a repoless automated session
   */
  async runSession(prompt: string) {
    console.log(`[JulesService] Running automated session: ${prompt.substring(0, 50)}...`);
    const client = await this.getClient();
    
    // `.run()` is fire-and-forget for automated simple executions 
    // It returns the final result rather than a session handle
    const result = await client.run({ prompt });
    return result;
  }

  /**
   * Get a point-in-time snapshot of the session
   */
  async getSessionSnapshot(sessionId: string, options?: { includeActivities?: boolean }) {
    const session = await this.getSession(sessionId);
    const snapshot = await session.snapshot();
    const serialized = snapshot.toJSON();
    
    // Activities can be large, strip them by default to save bandwidth
    if (!options?.includeActivities) {
        delete (serialized as any).activities;
    }
    
    return serialized;
  }
  
  /**
   * Get the final result of a session, including parsed outputs
   */
  async getSessionResult(sessionId: string) {
      const session = await this.getSession(sessionId);
      const result = await session.result();
      
      // Parse detailed outputs. The SDK `SessionOutcome` might have nested props depending on version
      const rawResult: any = result;
      const info = rawResult.info || rawResult;
      const outputs = info.outputs || [];
      const parsedOutputs: any = {
          pullRequests: [],
          changeSets: [],
          generatedFiles: []
      };

      for (const output of outputs) {
          switch (output.type) {
              case 'pullRequest':
                  parsedOutputs.pullRequests.push({
                      title: output.pullRequest.title,
                      number: output.pullRequest.number,
                      url: output.pullRequest.htmlUrl,
                  });
                  break;
              case 'changeSet':
                  parsedOutputs.changeSets.push(...parseChangeSet(output.changeSet?.patch));
                  break;
              case 'generatedFile':
                  parsedOutputs.generatedFiles.push({
                      path: output.generatedFile.path,
                      content: output.generatedFile.content,
                  });
                  break;
          }
      }
      
      // Mark as completed
      await this.updateSessionActivity(sessionId, 'completed');
      
      return {
          state: info.state,
          error: info.error,
          outputs: parsedOutputs,
          rawResult: result // retain for direct access
      };
  }

  /**
   * Send a message to an active Jules Session
   */
  async sendMessage(sessionId: string, message: string) {
      const session = await this.getSession(sessionId);
      
      // Attempt to invoke the underlying chat/message facility or gracefully error
      if (typeof (session as any).sendMessage === "function") {
          return await (session as any).sendMessage(message);
      } else if (typeof (session as any).chat === "function") {
          return await (session as any).chat(message);
      } else {
          console.warn(`[JulesService] Session Client does not expose sendMessage/chat. Defaulting fallback.`, sessionId);
      }
  }

  /**
   * Wait for a specific state
   */
  async waitForState(sessionId: string, state: any) {
      const session = await this.getSession(sessionId);
      return await session.waitFor(state);
  }
}
