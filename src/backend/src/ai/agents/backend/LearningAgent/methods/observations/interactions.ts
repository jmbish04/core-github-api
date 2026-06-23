/**
 * @file LearningAgent/methods/observe-interactions.ts
 * @description Absorbed from legacy LearningAgent.ts — conversation analysis,
 *              pattern detection (doom loops, anti-patterns, standard violations),
 *              contemplation gate, and Sentinel pipeline (batch ingestion, enrichment, PR tracking).
 *              Pure functions with DI.
 */
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
import { eq } from "drizzle-orm";
import type { AIProvider } from "@/ai/providers";
import { Logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────
export type ConversationPayload = {
  conversations: Array<{
    role: "user" | "assistant" | "system";
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
  action: "propose" | "block" | "escalate";
  reason: string;
  priorReflectionId?: string;
};

type ObserveDeps = {
  ai: AIProvider;
  env: Env;
};

// ── Pattern Regexes ────────────────────────────────────────────────────
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

// ── Methods ────────────────────────────────────────────────────────────

export async function analyzeConversation(
  deps: ObserveDeps,
  payload: ConversationPayload,
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const db = getDb(deps.env.DB);

  for (const msg of payload.conversations) {
    await db
      .insert(learningMessages)
      .values({
        id: crypto.randomUUID(),
        threadId: sessionId,
        sessionId: sessionId,
        role: msg.role,
        content: msg.content,
        processed: false,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }

  const logger = new Logger(deps.env, "LearningAgent:observe");
  logger.info(
    `Analyzed ${payload.conversations.length} messages for session ${sessionId}`,
  );
  return sessionId;
}

export async function detectPatterns(
  deps: ObserveDeps,
  sessionId: string,
): Promise<InsightSummary[]> {
  const db = getDb(deps.env.DB);
  const messages = await db
    .select()
    .from(learningMessages)
    .where(eq(learningMessages.sessionId, sessionId));

  const insights: InsightSummary[] = [];

  for (const msg of messages) {
    const content = msg.content;

    const doomMatches = DOOM_LOOP_PATTERNS.filter((p) => p.test(content)).length;
    if (doomMatches >= 2) {
      const id = crypto.randomUUID();
      await db
        .insert(learningAiInsights)
        .values({
          id,
          sessionId,
          patternType: "doom_loop",
          title: "Doom loop pattern detected",
          description: `${doomMatches} apology/loop patterns found in message`,
          severity: 4,
          status: "open",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      insights.push({ id, patternType: "doom_loop", title: "Doom loop pattern detected", severity: 4 });
    }

    const antiMatches = ANTI_PATTERN_PATTERNS.filter((p) => p.test(content)).length;
    if (antiMatches >= 1) {
      const id = crypto.randomUUID();
      await db
        .insert(learningAiInsights)
        .values({
          id,
          sessionId,
          patternType: "anti_pattern",
          title: "Anti-pattern detected",
          description: `${antiMatches} anti-pattern matches in message`,
          severity: 3,
          status: "open",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      insights.push({ id, patternType: "anti_pattern", title: "Anti-pattern detected", severity: 3 });
    }

    const stdMatches = STANDARD_VIOLATION_PATTERNS.filter((p) => p.test(content)).length;
    if (stdMatches >= 1) {
      const id = crypto.randomUUID();
      await db
        .insert(learningAiInsights)
        .values({
          id,
          sessionId,
          patternType: "standard_violation",
          title: "Standard violation detected",
          description: `${stdMatches} standard violation patterns in message`,
          severity: 2,
          status: "open",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      insights.push({
        id,
        patternType: "standard_violation",
        title: "Standard violation detected",
        severity: 2,
      });
    }

    await db.update(learningMessages).set({ processed: true }).where(eq(learningMessages.id, msg.id));
  }

  const logger = new Logger(deps.env, "LearningAgent:observe");
  logger.info(`Detected ${insights.length} patterns for session ${sessionId}`);
  return insights;
}

export async function contemplationGateCheck(
  deps: ObserveDeps,
  patternDescription: string,
): Promise<GateDecision> {
  try {
    const embedding = await deps.ai.generateEmbedding(patternDescription);
    if (!embedding || embedding.length === 0) {
      return { action: "propose", reason: "Could not generate embedding; defaulting to propose." };
    }

    const queryResult = (await deps.env.VECTORIZE_INDEX.query(embedding, {
      topK: 5,
      returnMetadata: "all",
    })) as { matches: Array<{ id: string; score: number; metadata?: { insightId?: string } }> };

    const highSimilarityMatches = (queryResult.matches ?? []).filter(
      (m: { id: string; score: number }) => m.score > 0.85,
    );

    if (highSimilarityMatches.length === 0) {
      return { action: "propose", reason: "No similar prior patterns found." };
    }

    const db = getDb(deps.env.DB);
    for (const match of highSimilarityMatches) {
      const insightId = match.metadata?.insightId ?? match.id;
      const reflections = await db
        .select()
        .from(learningAiPrReflections)
        .where(eq(learningAiPrReflections.insightId, insightId));

      for (const reflection of reflections) {
        if (reflection.outcome === "failed" || reflection.outcome === "reverted") {
          return {
            action: "escalate",
            reason: `Similar pattern (score: ${match.score.toFixed(3)}) previously ${reflection.outcome}. Root cause: ${reflection.rootCause ?? "unknown"}`,
            priorReflectionId: reflection.id,
          };
        }
        if (reflection.outcome === "succeeded") {
          return {
            action: "block",
            reason: `Similar pattern (score: ${match.score.toFixed(3)}) already resolved successfully. No new action needed.`,
            priorReflectionId: reflection.id,
          };
        }
      }
    }

    return { action: "propose", reason: "Similar patterns found but no blocking reflections." };
  } catch (err: any) {
    const logger = new Logger(deps.env, "LearningAgent:observe");
    logger.error("Contemplation gate error:", { error: err.message });
    return { action: "propose", reason: `Gate check failed (${err.message}); defaulting to propose.` };
  }
}

export async function proposeInsight(deps: ObserveDeps, insightId: string): Promise<void> {
  const db = getDb(deps.env.DB);
  await db
    .update(learningAiInsights)
    .set({ status: "proposed", updatedAt: new Date() })
    .where(eq(learningAiInsights.id, insightId));
  const logger = new Logger(deps.env, "LearningAgent:observe");
  logger.info(`Insight ${insightId} proposed.`);
}

export async function ingestPR(
  deps: ObserveDeps,
  data: {
    prNumber: number;
    repoOwner: string;
    repoName: string;
    prUrl?: string;
    prDescription?: string;
    merged: boolean;
  },
): Promise<void> {
  const db = getDb(deps.env.DB);
  await db.insert(learningAiInsightPrs).values({
    id: crypto.randomUUID(),
    insightId: "",
    prNumber: data.prNumber,
    repo: `${data.repoOwner}/${data.repoName}`,
    status: data.merged ? "merged" : "closed",
    outcome: data.merged ? "merged" : "closed",
    createdAt: new Date(),
  });
}

export async function runFullCycle(deps: ObserveDeps): Promise<void> {
  const sessionId = crypto.randomUUID();
  const db = getDb(deps.env.DB);

  await db.insert(learningSessions).values({
    id: sessionId,
    triggerType: "cron",
    status: "running",
    startedAt: new Date(),
    createdAt: new Date(),
  });

  try {
    await ingestSessions(deps, sessionId);
    await enrichThreads(deps);

    await db
      .update(learningSessions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(learningSessions.id, sessionId));
  } catch (err) {
    await db
      .update(learningSessions)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(learningSessions.id, sessionId));
    throw err;
  }
}

async function ingestSessions(deps: ObserveDeps, sessionId?: string): Promise<void> {
  const db = getDb(deps.env.DB);
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

  const logger = new Logger(deps.env, "LearningAgent:observe");
  logger.info(
    `Ingested ${threadCount} new threads from ${unprocessed.length} messages`,
  );
}

async function enrichThreads(deps: ObserveDeps): Promise<void> {
  const db = getDb(deps.env.DB);
  const processed = await db
    .select()
    .from(learningMessages)
    .where(eq(learningMessages.processed, true))
    .limit(10);

  for (const msg of processed) {
    try {
      const existingEnrichment = await db
        .select()
        .from(learningEnrichment)
        .where(eq(learningEnrichment.messageId, msg.id))
        .limit(1);

      if (existingEnrichment.length > 0) continue;

      const query = msg.content.substring(0, 200);
      await db.insert(learningEnrichment).values({
        id: crypto.randomUUID(),
        messageId: msg.id,
        matchedUrl: "",
        snippet: query,
        createdAt: new Date(),
      });
    } catch (err) {
      const logger = new Logger(deps.env, "LearningAgent:observe");
      logger.error(`Failed to enrich message ${msg.id}:`, { error: String(err) });
    }
  }

  const logger = new Logger(deps.env, "LearningAgent:observe");
  logger.info(`Enriched ${processed.length} messages`);
}
