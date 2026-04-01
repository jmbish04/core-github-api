/**
 * LearningAgent Durable Object
 *
 * Analyzes conversation payloads for patterns (doom loops, anti-patterns, etc.),
 * persists insights to D1, and gates new insight proposals through the
 * Contemplation Gate (vector similarity check against prior reflections).
 *
 * Also provides Sentinel pipeline routes for batch ingestion, enrichment,
 * and PR tracking from SentinelPostMerge automation.
 *
 * Routes:
 *   GET  /health      → { ok: true }
 *   POST /analyze     → analyzeConversation(payload)
 *   POST /contemplate → contemplationGateCheck(patternDescription)
 *   POST /detect      → detectPatterns(sessionId)
 *   POST /ingest      → ingestSessions (Jules → learning tables)
 *   POST /enrich      → enrichThreads (AI analysis on messages)
 *   POST /ingest-pr   → ingestPR (from SentinelPostMerge)
 *   GET  /status      → current agent state
 *   POST /schedule/run → full cron cycle
 *
 * @module AI/Agents/LearningAgent
 */

import { DurableObject } from "cloudflare:workers";
import { getDb } from "@db";
import {
  learningAiInsights,
  learningAiPrReflections,
  learningAiInsightPrs,
  learningMessages,
  learningSessions,
  learningThreads,
  learningEnrichment,
} from "@db/schemas/github/learning";
import { eq, desc, isNotNull } from "drizzle-orm";

/** Typed env bindings used by this agent (subset of full Env). */
interface LearningEnv extends Env {
  AI: { run(model: string, input: { text: string }): Promise<{ data: number[][] }> };
  VECTORIZE_INDEX: VectorizeIndex;
}

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

export class LearningAgent extends DurableObject<Env> {
  /** Internal state for status tracking */
  private agentStatus = "idle";
  private lastIngestionAt: string | null = null;
  private lastEnrichmentAt: string | null = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    try {
      // ── Main's original routes ──────────────────────────────────────────
      if (url.pathname === '/health') {
        return json({ ok: true });
      }

      if (url.pathname === '/analyze' && request.method === 'POST') {
        let body: { payload?: ConversationPayload; repoless?: boolean };
        try {
          body = await request.json() as { payload?: ConversationPayload; repoless?: boolean };
        } catch {
          return json({ error: 'Invalid JSON' }, 400);
        }
        const payload = body.payload ?? (body as unknown as ConversationPayload);
        const result = await this.analyzeConversation(payload, body.repoless ?? payload.repoless ?? false);
        return json({ sessionId: result });
      }

      if (url.pathname === '/contemplate' && request.method === 'POST') {
        let body: { patternDescription?: string };
        try {
          body = await request.json() as { patternDescription?: string };
        } catch {
          return json({ error: 'Invalid JSON' }, 400);
        }
        const decision = await this.contemplationGateCheck(body.patternDescription ?? '');
        return json(decision);
      }

      if (url.pathname === '/detect' && request.method === 'POST') {
        let body: { sessionId?: string };
        try {
          body = await request.json() as { sessionId?: string };
        } catch {
          return json({ error: 'Invalid JSON' }, 400);
        }
        const insights = await this.detectPatterns(body.sessionId ?? '');
        return json({ insights });
      }

      // ── Sentinel pipeline routes ────────────────────────────────────────
      if (url.pathname === '/schedule/run' && request.method === 'POST') {
        await this.runFullCycle();
        return json({ status: 'completed' });
      }

      if (url.pathname === '/ingest' && request.method === 'POST') {
        await this.ingestSessions();
        return json({ status: 'ingested' });
      }

      if (url.pathname === '/enrich' && request.method === 'POST') {
        await this.enrichThreads();
        return json({ status: 'enriched' });
      }

      if (url.pathname === '/ingest-pr' && request.method === 'POST') {
        const prData = await request.json() as any;
        await this.ingestPR(prData);
        return json({ status: 'pr_ingested' });
      }

      if (url.pathname === '/status') {
        return json({
          status: this.agentStatus,
          lastIngestionAt: this.lastIngestionAt,
          lastEnrichmentAt: this.lastEnrichmentAt,
        });
      }

      return new Response('Not found', { status: 404 });
    } catch (err: any) {
      console.error("[LearningAgent] Error:", err);
      return json({ error: err.message }, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // analyzeConversation (from main)
  // ---------------------------------------------------------------------------

  async analyzeConversation(
    payload: ConversationPayload,
    repoless = false
  ): Promise<string> {
    const sessionId = crypto.randomUUID();
    const db = getDb(this.env.DB);

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

    console.log(`[LearningAgent] Analyzed ${payload.conversations.length} messages for session ${sessionId}`);
    return sessionId;
  }

  // ---------------------------------------------------------------------------
  // detectPatterns (from main)
  // ---------------------------------------------------------------------------

  async detectPatterns(sessionId: string): Promise<InsightSummary[]> {
    const db = getDb(this.env.DB);
    const messages = await db.select()
      .from(learningMessages)
      .where(eq(learningMessages.sessionId, sessionId));

    const insights: InsightSummary[] = [];

    for (const msg of messages) {
      const content = msg.content;

      const doomMatches = DOOM_LOOP_PATTERNS.filter(p => p.test(content)).length;
      if (doomMatches >= 2) {
        const id = crypto.randomUUID();
        await db.insert(learningAiInsights).values({
          id,
          sessionId,
          patternType: 'doom_loop',
          title: 'Doom loop pattern detected',
          description: `${doomMatches} apology/loop patterns found in message`,
          severity: 4,
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoNothing();
        insights.push({ id, patternType: 'doom_loop', title: 'Doom loop pattern detected', severity: 4 });
      }

      const antiMatches = ANTI_PATTERN_PATTERNS.filter(p => p.test(content)).length;
      if (antiMatches >= 1) {
        const id = crypto.randomUUID();
        await db.insert(learningAiInsights).values({
          id,
          sessionId,
          patternType: 'anti_pattern',
          title: 'Anti-pattern detected',
          description: `${antiMatches} anti-pattern matches in message`,
          severity: 3,
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoNothing();
        insights.push({ id, patternType: 'anti_pattern', title: 'Anti-pattern detected', severity: 3 });
      }

      const stdMatches = STANDARD_VIOLATION_PATTERNS.filter(p => p.test(content)).length;
      if (stdMatches >= 1) {
        const id = crypto.randomUUID();
        await db.insert(learningAiInsights).values({
          id,
          sessionId,
          patternType: 'standard_violation',
          title: 'Standard violation detected',
          description: `${stdMatches} standard violation patterns in message`,
          severity: 2,
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoNothing();
        insights.push({ id, patternType: 'standard_violation', title: 'Standard violation detected', severity: 2 });
      }

      await db.update(learningMessages)
        .set({ processed: true })
        .where(eq(learningMessages.id, msg.id));
    }

    console.log(`[LearningAgent] Detected ${insights.length} patterns for session ${sessionId}`);
    return insights;
  }

  // ---------------------------------------------------------------------------
  // contemplationGateCheck — THE CONTEMPLATION GATE (from main)
  // ---------------------------------------------------------------------------

  async contemplationGateCheck(patternDescription: string): Promise<GateDecision> {
    try {
      const env = this.env as LearningEnv;
      const embeddingResult = await env.AI.run(
        '@cf/baai/bge-large-en-v1.5',
        { text: patternDescription }
      );

      const embedding = embeddingResult?.data?.[0];
      if (!embedding) {
        return { action: 'propose', reason: 'Could not generate embedding; defaulting to propose.' };
      }

      const queryResult = await env.VECTORIZE_INDEX.query(
        embedding,
        { topK: 5, returnMetadata: 'all' }
      ) as { matches: Array<{ id: string; score: number; metadata?: { insightId?: string } }> };

      const highSimilarityMatches = (queryResult.matches ?? []).filter(
        (m: { id: string; score: number }) => m.score > 0.85
      );

      if (highSimilarityMatches.length === 0) {
        return { action: 'propose', reason: 'No similar prior patterns found.' };
      }

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

      return { action: 'propose', reason: 'Similar patterns found but no blocking reflections.' };
    } catch (err: any) {
      console.error('[LearningAgent] Contemplation gate error:', err.message);
      return { action: 'propose', reason: `Gate check failed (${err.message}); defaulting to propose.` };
    }
  }

  // ---------------------------------------------------------------------------
  // proposeInsight (from main)
  // ---------------------------------------------------------------------------

  async proposeInsight(insightId: string): Promise<void> {
    const db = getDb(this.env.DB);
    await db.update(learningAiInsights)
      .set({ status: 'proposed', updatedAt: new Date() })
      .where(eq(learningAiInsights.id, insightId));
    console.log(`[LearningAgent] Insight ${insightId} proposed.`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Sentinel Pipeline Methods (batch ingestion, enrichment, PR tracking)
  // ═══════════════════════════════════════════════════════════════════════════

  private async runFullCycle(): Promise<void> {
    this.agentStatus = "running";
    const sessionId = crypto.randomUUID();
    const db = getDb(this.env.DB);

    await db.insert(learningSessions).values({
      id: sessionId,
      triggerType: "cron",
      status: "running",
      startedAt: new Date(),
      createdAt: new Date(),
    });

    try {
      await this.ingestSessions(sessionId);
      await this.enrichThreads(sessionId);

      await db
        .update(learningSessions)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(learningSessions.id, sessionId));

      this.lastIngestionAt = new Date().toISOString();
      this.agentStatus = "idle";
    } catch (err) {
      await db
        .update(learningSessions)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(learningSessions.id, sessionId));
      this.agentStatus = "failed";
      throw err;
    }
  }

  // ── Ingest Sessions ─────────────────────────────────────────────────────

  private async ingestSessions(sessionId?: string): Promise<void> {
    const db = getDb(this.env.DB);
    const learningSessionId = sessionId || crypto.randomUUID();

    if (!sessionId) {
      await db.insert(learningSessions).values({
        id: learningSessionId,
        triggerType: "manual",
        status: "running",
        startedAt: new Date(),
        createdAt: new Date(),
      });
    }

    // Find unprocessed messages and create threads for them
    const unprocessed = await db
      .select()
      .from(learningMessages)
      .where(eq(learningMessages.processed, false))
      .limit(20);

    let threadCount = 0;
    const sessionThreads = new Map<string, boolean>();

    for (const msg of unprocessed) {
      if (sessionThreads.has(msg.sessionId)) continue;
      sessionThreads.set(msg.sessionId, true);

      // Create thread if not exists
      const existing = await db
        .select()
        .from(learningThreads)
        .where(eq(learningThreads.sessionId, msg.sessionId))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(learningThreads).values({
          id: crypto.randomUUID(),
          sessionId: msg.sessionId,
          topic: `Session ${msg.sessionId.substring(0, 8)}`,
          createdAt: new Date(),
        });
        threadCount++;
      }
    }

    console.log(`[LearningAgent] Ingested ${threadCount} new threads from ${unprocessed.length} messages`);
  }

  // ── Enrich Threads ──────────────────────────────────────────────────────

  private async enrichThreads(sessionId?: string): Promise<void> {
    const db = getDb(this.env.DB);

    // Find messages without enrichment that have been processed
    const processed = await db
      .select()
      .from(learningMessages)
      .where(eq(learningMessages.processed, true))
      .limit(10);

    for (const msg of processed) {
      try {
        // Check if enrichment already exists
        const existingEnrichment = await db
          .select()
          .from(learningEnrichment)
          .where(eq(learningEnrichment.messageId, msg.id))
          .limit(1);

        if (existingEnrichment.length > 0) continue;

        // Store enrichment record with a docs query derived from content
        const query = msg.content.substring(0, 200);
        await db.insert(learningEnrichment).values({
          id: crypto.randomUUID(),
          messageId: msg.id,
          matchedUrl: "",
          snippet: query,
          createdAt: new Date(),
        });
      } catch (err) {
        console.error(`[LearningAgent] Failed to enrich message ${msg.id}:`, err);
      }
    }

    this.lastEnrichmentAt = new Date().toISOString();
    console.log(`[LearningAgent] Enriched ${processed.length} messages`);
  }

  // ── Safe JSON Parser for LLM Output ───────────────────────────────────

  private safeParseJson(raw: string): Record<string, any> | null {
    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  // ── Vectorize High-Signal Insights ────────────────────────────────────

  private async vectorizeInsight(insightId: string, text: string): Promise<void> {
    try {
      const env = this.env as LearningEnv;
      const embeddingResult = await env.AI.run(
        '@cf/baai/bge-large-en-v1.5',
        { text }
      );
      const vectors = embeddingResult?.data?.[0];
      if (vectors) {
        await env.VECTORIZE_INDEX.upsert([
          {
            id: `learning:${insightId}`,
            values: vectors,
            metadata: { insightId, text: text.substring(0, 500) },
          },
        ]);
      }
    } catch (err) {
      console.error(`[LearningAgent] Failed to vectorize insight ${insightId}:`, err);
    }
  }

  // ── PR Ingestion (from SentinelPostMerge) ─────────────────────────────

  private async ingestPR(data: {
    prNumber: number;
    repoOwner: string;
    repoName: string;
    prUrl?: string;
    prDescription?: string;
    merged: boolean;
  }): Promise<void> {
    const db = getDb(this.env.DB);

    await db.insert(learningAiInsightPrs).values({
      id: crypto.randomUUID(),
      insightId: "", // Will be linked later during analysis
      prNumber: data.prNumber,
      repo: `${data.repoOwner}/${data.repoName}`,
      status: data.merged ? "merged" : "closed",
      outcome: data.merged ? "merged" : "closed",
      createdAt: new Date(),
    });
  }
}
