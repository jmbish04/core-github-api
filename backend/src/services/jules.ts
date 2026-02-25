
import type { JulesError } from '@google/jules-sdk';
import { getDb } from '@db';
import { julesSessions } from '@/db/schemas/agents/jules';
import { eq } from 'drizzle-orm';



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
      const session = await client.session(options);
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
   * Get the final result of a session
   */
  async getSessionResult(sessionId: string) {
      const session = await this.getSession(sessionId);
      const result = await session.result();
      
      // Mark as completed
      await this.updateSessionActivity(sessionId, 'completed');
      
      return result;
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
