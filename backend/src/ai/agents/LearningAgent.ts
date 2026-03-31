/**
 * LearningAgent Durable Object
 *
 * Analyzes conversation payloads for patterns (doom loops, anti-patterns, etc.),
 * persists insights to D1, and gates new insight proposals through the
 * Contemplation Gate (vector similarity check against prior reflections).
 *
 * Routes:
 *   GET  /health      → { ok: true }
 *   POST /analyze     → analyzeConversation(payload)
 *   POST /contemplate → contemplationGateCheck(patternDescription)
 *   POST /detect      → detectPatterns(sessionId)
 *
 * @module AI/Agents/LearningAgent
 */

import { BaseAgent } from "./base/BaseAgent";
import { getDb } from "@db";
import {
  learningAiInsights,
  learningAiPrReflections,
  learningMessages,
} from "@db/schemas/github/learning";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConversationPayload = {
  conversations: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
  }>;
  repoless?: boolean;
};

export type InsightSummary = {
  id: string;
  patternType: string;
  title: string;
  severity: number;
};

export type GateDecision = {
  action: 'propose' | 'block' | 'escalate';
  reason: string;
  priorReflectionId?: string;
};

// ---------------------------------------------------------------------------
// Patterns for analysis
// ---------------------------------------------------------------------------

const DOOM_LOOP_PATTERNS: RegExp[] = [
  /i('m| am) sorry/i,
  /i apologize/i,
  /my (mistake|bad|fault)/i,
  /let me try (again|a different)/i,
  /i keep (making|repeating)/i,
];

const ANTI_PATTERN_PATTERNS: RegExp[] = [
  /new_classes.*sqlite/i,
  /import.*from.*cloudflare.*workers.*vercel/i,
  /process\.env\./i,
  /require\(/i,
];

const STANDARD_VIOLATION_PATTERNS: RegExp[] = [
  /border-zinc-/i,
  /divide-/i,
  /console\.log\(/i,
];

// ---------------------------------------------------------------------------
// LearningAgent
// ---------------------------------------------------------------------------

export class LearningAgent extends BaseAgent {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/analyze' && request.method === 'POST') {
      let body: { payload?: ConversationPayload; repoless?: boolean };
      try {
        body = await request.json() as { payload?: ConversationPayload; repoless?: boolean };
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
      }
      const payload = body.payload ?? (body as unknown as ConversationPayload);
      const result = await this.analyzeConversation(payload, body.repoless ?? payload.repoless ?? false);
      return new Response(JSON.stringify({ sessionId: result }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/contemplate' && request.method === 'POST') {
      let body: { patternDescription?: string };
      try {
        body = await request.json() as { patternDescription?: string };
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
      }
      const decision = await this.contemplationGateCheck(body.patternDescription ?? '');
      return new Response(JSON.stringify(decision), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/detect' && request.method === 'POST') {
      let body: { sessionId?: string };
      try {
        body = await request.json() as { sessionId?: string };
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
      }
      const insights = await this.detectPatterns(body.sessionId ?? '');
      return new Response(JSON.stringify({ insights }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this as any).__proto__.__proto__.fetch?.call(this, request) ?? new Response('Not found', { status: 404 });
  }

  // ---------------------------------------------------------------------------
  // analyzeConversation
  // ---------------------------------------------------------------------------

  /**
   * Analyze a raw conversation payload and persist messages + insights to D1.
   * Returns a session ID for tracking.
   */
  async analyzeConversation(
    payload: ConversationPayload,
    repoless = false
  ): Promise<string> {
    const sessionId = crypto.randomUUID();
    const db = getDb(this.env.DB);

    // Persist each message
    for (const msg of payload.conversations) {
      await db.insert(learningMessages).values({
        id: crypto.randomUUID(),
        threadId: sessionId,
        sessionId,
        role: msg.role,
        content: msg.content,
        processed: false,
        createdAt: new Date(),
      }).onConflictDoNothing();
    }

    this.logger.info(`[LearningAgent] Analyzed ${payload.conversations.length} messages for session ${sessionId}`);
    return sessionId;
  }

  // ---------------------------------------------------------------------------
  // detectPatterns
  // ---------------------------------------------------------------------------

  /**
   * Run Workers AI analysis on unprocessed messages for a session.
   * Writes pattern matches to learning_ai_insights.
   */
  async detectPatterns(sessionId: string): Promise<InsightSummary[]> {
    const db = getDb(this.env.DB);
    const messages = await db.select()
      .from(learningMessages)
      .where(eq(learningMessages.sessionId, sessionId));

    const insights: InsightSummary[] = [];

    for (const msg of messages) {
      const content = msg.content;

      // Check doom loop
      const doomMatches = DOOM_LOOP_PATTERNS.filter(p => p.test(content)).length;
      if (doomMatches >= 2) {
        const id = crypto.randomUUID();
        await db.insert(learningAiInsights).values({
          id,
          sessionId,
          patternType: 'doom_loop',
          title: `Doom loop pattern detected`,
          description: `${doomMatches} apology/loop patterns found in message`,
          severity: 4,
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoNothing();
        insights.push({ id, patternType: 'doom_loop', title: 'Doom loop pattern detected', severity: 4 });
      }

      // Check anti-patterns
      const antiMatches = ANTI_PATTERN_PATTERNS.filter(p => p.test(content)).length;
      if (antiMatches >= 1) {
        const id = crypto.randomUUID();
        await db.insert(learningAiInsights).values({
          id,
          sessionId,
          patternType: 'anti_pattern',
          title: `Anti-pattern detected`,
          description: `${antiMatches} anti-pattern matches in message`,
          severity: 3,
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoNothing();
        insights.push({ id, patternType: 'anti_pattern', title: 'Anti-pattern detected', severity: 3 });
      }

      // Check standard violations
      const stdMatches = STANDARD_VIOLATION_PATTERNS.filter(p => p.test(content)).length;
      if (stdMatches >= 1) {
        const id = crypto.randomUUID();
        await db.insert(learningAiInsights).values({
          id,
          sessionId,
          patternType: 'standard_violation',
          title: `Standard violation detected`,
          description: `${stdMatches} standard violation patterns in message`,
          severity: 2,
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoNothing();
        insights.push({ id, patternType: 'standard_violation', title: 'Standard violation detected', severity: 2 });
      }

      // Mark processed
      await db.update(learningMessages)
        .set({ processed: true })
        .where(eq(learningMessages.id, msg.id));
    }

    this.logger.info(`[LearningAgent] Detected ${insights.length} patterns for session ${sessionId}`);
    return insights;
  }

  // ---------------------------------------------------------------------------
  // contemplationGateCheck — THE CONTEMPLATION GATE
  // ---------------------------------------------------------------------------

  /**
   * Runs the Contemplation Gate: embeds the pattern description, queries
   * Vectorize for similar prior patterns, and checks their outcomes in D1.
   *
   * - If a prior similar insight failed/reverted → escalate
   * - If a prior similar insight succeeded → block (already solved)
   * - Default → propose
   */
  async contemplationGateCheck(patternDescription: string): Promise<GateDecision> {
    try {
      // 1. Embed the pattern description
      const embeddingResult = await (this.env as any).AI.run(
        '@cf/baai/bge-large-en-v1.5',
        { text: patternDescription }
      ) as { data: number[][] };

      const embedding = embeddingResult?.data?.[0];
      if (!embedding) {
        return { action: 'propose', reason: 'Could not generate embedding; defaulting to propose.' };
      }

      // 2. Query Vectorize for top-5 similar patterns
      const queryResult = await (this.env as any).VECTORIZE_INDEX.query(
        embedding,
        { topK: 5, returnMetadata: true }
      ) as { matches: Array<{ id: string; score: number; metadata?: { insightId?: string } }> };

      const highSimilarityMatches = (queryResult.matches ?? []).filter(
        (m: { id: string; score: number }) => m.score > 0.85
      );

      if (highSimilarityMatches.length === 0) {
        return { action: 'propose', reason: 'No similar prior patterns found.' };
      }

      // 3. Check reflections for each high-similarity match
      const db = getDb(this.env.DB);
      for (const match of highSimilarityMatches) {
        const insightId = match.metadata?.insightId ?? match.id;
        const reflections = await db.select()
          .from(learningAiPrReflections)
          .where(eq(learningAiPrReflections.insightId, insightId));

        for (const reflection of reflections) {
          if (reflection.outcome === 'failed' || reflection.outcome === 'reverted') {
            return {
              action: 'escalate',
              reason: `Similar pattern (score: ${match.score.toFixed(3)}) previously ${reflection.outcome}. Root cause: ${reflection.rootCause ?? 'unknown'}`,
              priorReflectionId: reflection.id,
            };
          }
          if (reflection.outcome === 'succeeded') {
            return {
              action: 'block',
              reason: `Similar pattern (score: ${match.score.toFixed(3)}) already resolved successfully. No new action needed.`,
              priorReflectionId: reflection.id,
            };
          }
        }
      }

      // 4. Default: propose
      return { action: 'propose', reason: 'Similar patterns found but no blocking reflections.' };

    } catch (err: any) {
      this.logger.error('[LearningAgent] Contemplation gate error', { error: err.message });
      return { action: 'propose', reason: `Gate check failed (${err.message}); defaulting to propose.` };
    }
  }

  // ---------------------------------------------------------------------------
  // proposeInsight
  // ---------------------------------------------------------------------------

  /**
   * Only called after the Contemplation Gate returns 'propose'.
   * Updates insight status to 'proposed'.
   */
  async proposeInsight(insightId: string): Promise<void> {
    const db = getDb(this.env.DB);
    await db.update(learningAiInsights)
      .set({ status: 'proposed', updatedAt: new Date() })
      .where(eq(learningAiInsights.id, insightId));
    this.logger.info(`[LearningAgent] Insight ${insightId} proposed.`);
  }
}
