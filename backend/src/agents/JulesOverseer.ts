import { BaseAgent } from "./BaseAgent";

import { getDb } from "@db";
import { julesSessions } from "../db/schema-jules";
import { eq, lt, and, notInArray, desc } from "drizzle-orm";
import { JulesService } from "../services/jules";
import { resolveDefaultAiProvider, resolveDefaultAiModel } from "@/lib/agent-ai";

type SessionCheckResult = {
  sessionId: string;
  status: string;
  actionTaken: string;
};

export class JulesOverseer extends BaseAgent {
  // Check for sessions inactive for more than 1 hour
  private static STUCK_THRESHOLD_MS = 60 * 60 * 1000; 

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === '/schedule/check') {
          await this.checkActiveSessions();
          return new Response('OK');
      }
      return super.fetch(request);
  }

  async checkActiveSessions(): Promise<SessionCheckResult[]> {
    const db = getDb(this.env.DB);
    const julesService = JulesService.getInstance(this.env);
    const results: SessionCheckResult[] = [];

    // Find active sessions
    const activeSessions = await db.select()
      .from(julesSessions)
      .where(notInArray(julesSessions.status, ['completed', 'failed', 'waiting_for_user']))
      .orderBy(desc(julesSessions.lastActivityAt))
      .limit(50); // Process batch

    console.log(`[JulesOverseer] Checking ${activeSessions.length} active sessions`);

    for (const sessionRecord of activeSessions) {
        const timeSinceActivity = Date.now() - sessionRecord.lastActivityAt.getTime();
        
        if (timeSinceActivity > JulesOverseer.STUCK_THRESHOLD_MS) {
            console.log(`[JulesOverseer] Session ${sessionRecord.id} appears stuck (${Math.round(timeSinceActivity/60000)}m inactive)`);
            
            // Check real status from Jules SDK
            try {
                const session = await julesService.getSession(sessionRecord.id);
                const sessionInfo = await session.info();
                const sessionState = sessionInfo.state as string;
                
                if (sessionState === 'running' || sessionState === 'created') {
                     // It is genuinely stuck/idle on Jules side
                     await this.attemptIntervention(sessionRecord, sessionInfo);
                     results.push({ sessionId: sessionRecord.id, status: 'stuck', actionTaken: 'intervention_attempted' });
                } else if (sessionState === 'done' || sessionState === 'error') {
                     // It finished but our DB missed it
                     await db.update(julesSessions)
                       .set({ 
                           status: sessionState === 'done' ? 'completed' : 'failed',
                           updatedAt: new Date(),
                           lastActivityAt: new Date()
                       })
                       .where(eq(julesSessions.id, sessionRecord.id));
                     results.push({ sessionId: sessionRecord.id, status: sessionInfo.state, actionTaken: 'status_synced' });
                }
            } catch (err) {
                console.error(`[JulesOverseer] Failed to inspect session ${sessionRecord.id}`, err);
                results.push({ sessionId: sessionRecord.id, status: 'error', actionTaken: 'inspection_failed' });
            }
        } else {
            results.push({ sessionId: sessionRecord.id, status: 'active', actionTaken: 'none' });
        }
    }

    return results;
  }

  private async attemptIntervention(sessionRecord: typeof julesSessions.$inferSelect, sessionInfo: any) {
     const db = getDb(this.env.DB);
     
     // 1. Mark as requiring attention if we've already tried to help too many times
     if ((sessionRecord.assistanceCount || 0) >= 3) {
         await db.update(julesSessions)
           .set({ status: 'waiting_for_user', requiresUserAttention: true })
           .where(eq(julesSessions.id, sessionRecord.id));
         return;
     }

     // 2. Use AI to determine if we can help
     const prompt = `Original Prompt: ${sessionRecord.prompt}\n\nCurrent State: ${sessionInfo.state}\n\nGenerate a short, encouraging hint to verify progress.`;
     
     const hint = await this.runTextWithModel({
         name: "JulesOverseer",
         instructions: `You are a supervisor for an AI coding agent named Jules. 
         Jules has been inactive for a while. 
         Your goal is to generate a helpful "nudge" or hint to unblock Jules based on the original prompt.
         If you cannot help, output "NO_HELP".`,
         prompt,
         provider: resolveDefaultAiProvider(this.env),
         model: resolveDefaultAiModel(this.env, resolveDefaultAiProvider(this.env))
     });
     
     if (hint.includes("NO_HELP")) {
          // Just update metrics
          await db.update(julesSessions)
            .set({ 
                assistanceCount: (sessionRecord.assistanceCount || 0) + 1,
                updatedAt: new Date()
            })
            .where(eq(julesSessions.id, sessionRecord.id));
     } else {
          // Send hint to session (simulate by logging and updating metadata)
          console.log(`[JulesOverseer] Generated hint for ${sessionRecord.id}: ${hint}`);
          
          let currentMetadata = {};
          try {
             currentMetadata = JSON.parse(sessionRecord.metadataJson || '{}');
          } catch {}

          await db.update(julesSessions)
            .set({ 
                assistanceCount: (sessionRecord.assistanceCount || 0) + 1,
                metadataJson: JSON.stringify({ ...currentMetadata, lastHint: hint }),
                updatedAt: new Date()
            })
            .where(eq(julesSessions.id, sessionRecord.id));
     }
  }

  async scheduled(event: ScheduledEvent) {
    console.log("[JulesOverseer] Running scheduled check...");
    await this.checkActiveSessions();
  }
}
