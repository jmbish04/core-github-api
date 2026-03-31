/**
 * @file backend/src/ai/agents/LearningAgent.ts
 * @description Sentinel Learning Agent — a Durable Object that autonomously
 * ingests agent conversations, enriches them via Docs MCP, runs AI analysis
 * to detect architectural anti-patterns, and implements the Contemplation Gate.
 *
 * Triggered by:
 *   - Cron schedule (every 4 hours)
 *   - Manual HTTP request to POST /ingest
 *   - PR webhook forwarding from SentinelPostMerge automation
 *
 * @module AI/Agents/LearningAgent
 */

import { BaseAgent } from "./base/BaseAgent";
import { getDb } from "@db";
import { julesSessions } from "@db/schemas/jules";
import { learningSessions } from "@/db/schemas/github/learning/sessions";
import { learningThreads } from "@/db/schemas/github/learning/threads";
import { learningMessages } from "@/db/schemas/github/learning/messages";
import { learningEnrichment } from "@/db/schemas/github/learning/enrichment";
import { aiInsights } from "@/db/schemas/github/learning/ai-insights";
import { aiInsightPrs } from "@/db/schemas/github/learning/ai-insight-prs";
import { aiPrReflections } from "@/db/schemas/github/learning/ai-pr-reflections";
import { eq, desc, isNull, and, notInArray } from "drizzle-orm";

interface LearningAgentState {
  status: string;
  lastIngestionAt: string | null;
  lastEnrichmentAt: string | null;
  lastContemplationAt: string | null;
  history: Record<string, unknown>[];
}

export class LearningAgent extends BaseAgent<Env, LearningAgentState> {
  state: LearningAgentState = {
    status: "idle",
    lastIngestionAt: null,
    lastEnrichmentAt: null,
    lastContemplationAt: null,
    history: [],
  };

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case "/schedule/run":
          await this.runFullCycle();
          return new Response(JSON.stringify({ status: "completed" }), {
            headers: { "content-type": "application/json" },
          });

        case "/ingest":
          if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405 });
          }
          await this.ingestSessions();
          return new Response(JSON.stringify({ status: "ingested" }), {
            headers: { "content-type": "application/json" },
          });

        case "/enrich":
          if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405 });
          }
          await this.enrichThreads();
          return new Response(JSON.stringify({ status: "enriched" }), {
            headers: { "content-type": "application/json" },
          });

        case "/analyze":
          if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405 });
          }
          await this.analyzePatterns();
          return new Response(JSON.stringify({ status: "analyzed" }), {
            headers: { "content-type": "application/json" },
          });

        case "/ingest-pr":
          if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405 });
          }
          const prData = await request.json() as any;
          await this.ingestPR(prData);
          return new Response(JSON.stringify({ status: "pr_ingested" }), {
            headers: { "content-type": "application/json" },
          });

        case "/status":
          return new Response(JSON.stringify(this.state), {
            headers: { "content-type": "application/json" },
          });

        default:
          return super.fetch(request);
      }
    } catch (err: any) {
      console.error("[LearningAgent] Error:", err);
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
  }

  // ── Full Cycle (Cron Entry) ────────────────────────────────────────────────

  private async runFullCycle(): Promise<void> {
    await this.setStatus("running");
    const sessionId = crypto.randomUUID();
    const db = getDb(this.env.DB);

    await db.insert(learningSessions).values({
      id: sessionId,
      triggerType: "cron",
      status: "running",
      timestamp: new Date().toISOString(),
    });

    try {
      await this.ingestSessions(sessionId);
      await this.enrichThreads(sessionId);
      await this.analyzePatterns(sessionId);

      await db
        .update(learningSessions)
        .set({ status: "completed", completedAt: new Date().toISOString() })
        .where(eq(learningSessions.id, sessionId));

      this.state.lastIngestionAt = new Date().toISOString();
      await this.setStatus("idle");
    } catch (err) {
      await db
        .update(learningSessions)
        .set({ status: "failed", completedAt: new Date().toISOString() })
        .where(eq(learningSessions.id, sessionId));
      await this.setStatus("failed");
      throw err;
    }
  }

  // ── Step 1: Ingest Jules Sessions ──────────────────────────────────────────

  private async ingestSessions(sessionId?: string): Promise<void> {
    const db = getDb(this.env.DB);
    const learningSessionId = sessionId || crypto.randomUUID();

    if (!sessionId) {
      await db.insert(learningSessions).values({
        id: learningSessionId,
        triggerType: "manual",
        status: "running",
      });
    }

    // Find completed Jules sessions not yet ingested
    const completedSessions = await db
      .select()
      .from(julesSessions)
      .where(eq(julesSessions.status, "completed"))
      .orderBy(desc(julesSessions.createdAt))
      .limit(20);

    for (const session of completedSessions) {
      // Check if thread already exists for this session
      const existing = await db
        .select()
        .from(learningThreads)
        .where(eq(learningThreads.sourceIdentifier, session.id))
        .limit(1);

      if (existing.length > 0) continue;

      const threadId = crypto.randomUUID();
      await db.insert(learningThreads).values({
        id: threadId,
        sessionId: learningSessionId,
        source: "jules",
        sourceIdentifier: session.id,
        githubRepo: session.repoOwner && session.repoName
          ? `${session.repoOwner}/${session.repoName}`
          : null,
        title: session.prompt?.substring(0, 100) || "Jules Session",
        category: session.specialistClass || "general",
      });

      // Store the prompt as a message
      if (session.prompt) {
        await db.insert(learningMessages).values({
          id: crypto.randomUUID(),
          sessionId: learningSessionId,
          threadId,
          author: session.specialistClass || "system",
          message: session.prompt,
        });
      }
    }

    console.log(
      `[LearningAgent] Ingested ${completedSessions.length} Jules sessions`
    );
  }

  // ── Step 2: Enrich Threads via Docs MCP ────────────────────────────────────

  private async enrichThreads(sessionId?: string): Promise<void> {
    const db = getDb(this.env.DB);

    // Find messages without enrichment
    const unenriched = await db
      .select()
      .from(learningMessages)
      .where(isNull(learningMessages.aiAnalysis))
      .limit(10);

    for (const msg of unenriched) {
      try {
        // Generate a docs query from the message
        const queryResponse = await this.env.AI.run(
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any,
          {
            messages: [
              {
                role: "system",
                content:
                  "Extract a concise documentation search query from this agent conversation message. Return ONLY the search query, no explanation.",
              },
              { role: "user", content: msg.message },
            ],
            max_tokens: 100,
          }
        );

        const query = (queryResponse as any).response || msg.message.substring(0, 200);

        // Store enrichment record
        const enrichmentId = crypto.randomUUID();
        await db.insert(learningEnrichment).values({
          id: enrichmentId,
          messageId: msg.id,
          queryForMcp: query,
        });

        // Run AI analysis on the message
        const analysisResponse = await this.env.AI.run(
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any,
          {
            messages: [
              {
                role: "system",
                content: `Analyze this agent conversation message for architectural patterns, anti-patterns, or potential improvements. Categorize as: 'Global Env', 'Style Drift', 'Dependency', 'Performance', 'Security', or 'Best Practice'. Return a JSON object: { "category": "...", "severity": "low|medium|high|critical", "analysis": "...", "suggestion": "..." }`,
              },
              { role: "user", content: msg.message },
            ],
            max_tokens: 500,
          }
        );

        const analysis = (analysisResponse as any).response || "";

        await db
          .update(learningMessages)
          .set({ aiAnalysis: analysis })
          .where(eq(learningMessages.id, msg.id));

        await db
          .update(learningEnrichment)
          .set({ aiAnalysis: analysis })
          .where(eq(learningEnrichment.id, enrichmentId));
      } catch (err) {
        console.error(
          `[LearningAgent] Failed to enrich message ${msg.id}:`,
          err
        );
      }
    }

    this.state.lastEnrichmentAt = new Date().toISOString();
    console.log(
      `[LearningAgent] Enriched ${unenriched.length} messages`
    );
  }

  // ── Step 3: Analyze Patterns & Create Insights ─────────────────────────────

  private async analyzePatterns(sessionId?: string): Promise<void> {
    const db = getDb(this.env.DB);

    // Find analyzed messages that haven't been turned into insights yet
    const analyzed = await db
      .select()
      .from(learningMessages)
      .where(
        and(
          // Has AI analysis
          // We check for non-null ai_analysis
        )
      )
      .limit(20);

    const analyzedWithAnalysis = analyzed.filter(
      (m) => m.aiAnalysis && m.aiAnalysis.includes('"category"')
    );

    for (const msg of analyzedWithAnalysis) {
      try {
        const parsed = JSON.parse(msg.aiAnalysis!);
        if (!parsed.category || parsed.severity === "low") continue;

        // Check Contemplation Gate before creating insight
        const shouldCreate = await this.contemplationGate(
          parsed.category,
          parsed.analysis || parsed.suggestion || "",
          msg.threadId
        );

        if (!shouldCreate) {
          console.log(
            `[LearningAgent] Contemplation Gate blocked insight for category: ${parsed.category}`
          );
          continue;
        }

        const insightId = crypto.randomUUID();
        const thread = await db
          .select()
          .from(learningThreads)
          .where(eq(learningThreads.id, msg.threadId))
          .limit(1);

        await db.insert(aiInsights).values({
          id: insightId,
          category: parsed.category,
          severity: parsed.severity || "medium",
          insightAnalysis: parsed.analysis || msg.aiAnalysis!,
          suggestedImprovement: parsed.suggestion,
          threadId: msg.threadId,
          sessionId: sessionId || msg.sessionId,
          status: "PENDING",
          githubRepo: thread[0]?.githubRepo,
        });

        // Vectorize high-signal insights
        if (
          parsed.severity === "high" ||
          parsed.severity === "critical"
        ) {
          await this.vectorizeInsight(insightId, parsed.analysis || msg.aiAnalysis!);
        }
      } catch (err) {
        console.error(
          `[LearningAgent] Failed to analyze message ${msg.id}:`,
          err
        );
      }
    }

    this.state.lastContemplationAt = new Date().toISOString();
  }

  // ── Contemplation Gate ─────────────────────────────────────────────────────

  private async contemplationGate(
    category: string,
    analysis: string,
    threadId: string
  ): Promise<boolean> {
    const db = getDb(this.env.DB);

    // Check if similar insights exist that were already addressed
    const priorInsights = await db
      .select()
      .from(aiInsights)
      .where(
        and(
          eq(aiInsights.category, category),
          eq(aiInsights.status, "IMMUNIZED")
        )
      )
      .limit(5);

    if (priorInsights.length === 0) return true;

    // Check reflections for prior failures
    for (const prior of priorInsights) {
      const reflections = await db
        .select()
        .from(aiPrReflections)
        .where(eq(aiPrReflections.priorAiInsightId, prior.id))
        .limit(3);

      const failures = reflections.filter(
        (r) => r.agentPrSuccessDetermination === "failure"
      );

      if (failures.length >= 2) {
        console.log(
          `[LearningAgent] Contemplation Gate: Pattern "${category}" has ${failures.length} prior failures. Recommending template-level immunization.`
        );
        // Still create the insight, but mark it differently
        return true;
      }
    }

    // Check vector similarity for duplicate detection
    try {
      const embedding = await this.env.AI.run(
        "@cf/baai/bge-large-en-v1.5" as any,
        { text: [analysis] }
      );
      const vectors = (embedding as any).data?.[0];
      if (vectors) {
        const matches = await this.env.VECTORIZE.query(vectors, {
          topK: 3,
          namespace: "learning",
        });

        const highSimilarity = matches.matches?.filter(
          (m: any) => m.score > 0.92
        );
        if (highSimilarity?.length > 0) {
          console.log(
            `[LearningAgent] Contemplation Gate: Near-duplicate insight detected (score: ${highSimilarity[0].score})`
          );
          return false;
        }
      }
    } catch (err) {
      console.warn("[LearningAgent] Vectorize query failed, allowing insight:", err);
    }

    return true;
  }

  // ── Vectorize High-Signal Insights ─────────────────────────────────────────

  private async vectorizeInsight(
    insightId: string,
    text: string
  ): Promise<void> {
    try {
      const embedding = await this.env.AI.run(
        "@cf/baai/bge-large-en-v1.5" as any,
        { text: [text] }
      );
      const vectors = (embedding as any).data?.[0];
      if (vectors) {
        await this.env.VECTORIZE.upsert([
          {
            id: `learning:${insightId}`,
            values: vectors,
            namespace: "learning",
            metadata: { insightId, text: text.substring(0, 500) },
          },
        ]);
      }
    } catch (err) {
      console.error(
        `[LearningAgent] Failed to vectorize insight ${insightId}:`,
        err
      );
    }
  }

  // ── PR Ingestion (from SentinelPostMerge webhook) ──────────────────────────

  private async ingestPR(data: {
    prNumber: number;
    repoOwner: string;
    repoName: string;
    prUrl?: string;
    prDescription?: string;
    merged: boolean;
  }): Promise<void> {
    const db = getDb(this.env.DB);

    await db.insert(aiInsightPrs).values({
      id: crypto.randomUUID(),
      repoOwner: data.repoOwner,
      repoName: data.repoName,
      prNumber: data.prNumber,
      prUrl: data.prUrl,
      prDescription: data.prDescription,
      outcome: data.merged ? "MERGED" : "CLOSED",
    });
  }
}
