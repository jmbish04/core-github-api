/**
 * @file LearningAgent/methods/diagnose-health.ts
 * @description Fleet-wide SRE diagnostic agent that investigates, diagnoses,
 *              and remediates health failures across ANY worker in the fleet.
 *
 *              v7 changes:
 *              - Accepts explicit `WorkerTarget` — no longer assumes self-worker
 *              - Routes data access through peer agents (GithubAgent, CloudflareAgent)
 *              - Records every diagnosis in `fleet_observations` for recurrence tracking
 *              - Uses Vectorize RAG for log analysis and dispatches to Jules/GitHub PRs
 *
 *              Pure functions with DI.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AIProvider, AgentTool, BaseChatAgent } from '@/ai/providers';
import { getDb } from "@db";
import { healthResults } from "@db/schemas/logs/health";
import { julesJobs } from "@/db/schemas/agents/jules";
import { fleetObservations } from "@db/schemas/agents/fleet-observations";
import { desc } from "drizzle-orm";
import type { FleetDiagnoseInput, WorkerTarget } from "@/ai/agents/backend/LearningAgent/types";

// ── Types ──────────────────────────────────────────────────────────────
const HealthDiagnosticianOutputSchema = z.object({
  severity: z.enum(["low", "medium", "high", "critical"]),
  rootCause: z.string().describe("Explanation of the root cause"),
  suggestedFix: z.string().describe("Fix details or reasoning for not fixing"),
  prUrl: z.string().nullable().describe("URL to the PR created, or Jules Session ID, or null if transient"),
});

export type HealthDiagnosticianOutput = z.infer<typeof HealthDiagnosticianOutputSchema>;

type DiagnoseDeps = {
  ai: AIProvider;
  env: Env;
  agent?: BaseChatAgent<any>;
};

// ── Helpers ────────────────────────────────────────────────────────────

/** Compute a pattern hash for recurrence detection. */
async function computePatternHash(workerName: string, failureType: string, message: string): Promise<string> {
  const normalized = `${workerName}:${failureType}:${message.toLowerCase().trim().replace(/\s+/g, ' ')}`;
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Upsert a fleet observation record for recurrence tracking. */
async function recordFleetObservation(
  env: Env,
  input: FleetDiagnoseInput,
  patternHash: string,
): Promise<{ observationId: string; recurrenceCount: number }> {
  const db = getDb(env.DB);
  const now = new Date().toISOString();

  const existing = await db
    .select()
    .from(fleetObservations)
    .where(eq(fleetObservations.patternHash, patternHash))
    .limit(1);

  if (existing.length > 0) {
    const newCount = existing[0].recurrenceCount + 1;
    await db
      .update(fleetObservations)
      .set({
        recurrenceCount: newCount,
        updatedAt: now,
        contextMetadata: {
          ...(existing[0].contextMetadata as Record<string, unknown> ?? {}),
          lastDiagnosisAt: now,
          source: input.source,
        },
      })
      .where(eq(fleetObservations.id, existing[0].id));
    return { observationId: existing[0].id, recurrenceCount: newCount };
  }

  const observationId = crypto.randomUUID();
  await db.insert(fleetObservations).values({
    id: observationId,
    workerName: input.target.workerName,
    accountId: input.target.accountId ?? null,
    repoOwner: input.target.repoOwner ?? null,
    repoName: input.target.repoName ?? null,
    source: input.source,
    failureType: input.failure.type,
    failureMessage: input.failure.message,
    patternHash,
    recurrenceCount: 1,
    contextMetadata: input.context ? { ...input.context } : null,
    hitlPromoted: 0,
    hitlRecordId: null,
    createdAt: now,
    updatedAt: now,
  });

  return { observationId, recurrenceCount: 1 };
}

// ── Main Diagnostic Method ─────────────────────────────────────────────

export async function diagnoseHealthFailure(
  deps: DiagnoseDeps,
  input: FleetDiagnoseInput,
): Promise<HealthDiagnosticianOutput> {
  const target = input.target;
  const repoOwner = target.repoOwner || deps.env.GITHUB_OWNER || "jmbish04";
  const repoName = target.repoName || target.workerName;

  // Record observation for fleet-wide recurrence tracking
  const patternHash = await computePatternHash(
    target.workerName,
    input.failure.type,
    input.failure.message,
  );
  const observation = await recordFleetObservation(deps.env, input, patternHash);

  // MCP context enrichment — delegate to CloudflareAgent
  const mcpQuery = `How to fix Cloudflare worker error in ${target.workerName}: ${input.failure.type} - ${input.failure.message}`;

  let mcpContext = "No Cloudflare Docs context available.";
  try {
    if (deps.agent) {
      const cloudflareAgent = (deps.agent as any).getPeerAgent((deps.env as any).CLOUDFLARE_AGENT);
      const mcpResult = await cloudflareAgent.agenticSearch(mcpQuery);
      const docs = mcpResult?.docsContext;
      mcpContext = typeof docs === "string" ? docs : (docs ? JSON.stringify(docs) : mcpContext);
    }
  } catch {
    /* fallback */
  }

  const instructions = `You are a Senior Engineer and an autonomous Site Reliability Agent operating across the Cloudflare Workers fleet.
Your primary directive is to investigate, diagnose, and remediate health failures for the target worker.

TARGET WORKER: \`${target.workerName}\`
TARGET REPO: \`${repoOwner}/${repoName}\`
OBSERVATION ID: ${observation.observationId}
RECURRENCE COUNT: ${observation.recurrenceCount} (times this pattern has been seen across the fleet)

IMPORTANT: This worker may NOT be core-github-api. All file reads and PRs must target the correct repo (\`${repoOwner}/${repoName}\`).

CRITICAL PRE-FLIGHT CHECK:
1. Deduplication: You MUST use \`check_duplicate_pr\` to ensure no PRs or Jules tasks already exist for this issue.

TRIAGE AND REMEDIATION:
2. Analyze & Investigate: Read the error details, pull the failing code from the TARGET repo, and consult Cloudflare MCP docs if needed.
3. Reason about Complexity: Determine the scope of the fix.
   - IF SMALL: formulate the fix and use \`create_pull_request\` to submit it immediately.
   - IF COMPLEX: use \`delegate_to_jules\` to dispatch a deep-reasoning session.

Conclude with: severity, rootCause, suggestedFix, and prUrl.`;

  // Truncate/RAG error details
  const MAX_LOG_LENGTH = 15000;
  let stringifiedDetails = JSON.stringify(input.failure.details, null, 2) || "{}";

  if (Array.isArray(input.failure.details) && stringifiedDetails.length > MAX_LOG_LENGTH) {
    try {
      const { vectorizeAndStoreLogs } = await import("@/ai/utils/log-vectorizer");
      const runId = `diag-${Date.now()}`;
      await vectorizeAndStoreLogs(deps.env, runId, input.failure.details);

      const queryEmbeddings = await deps.ai.generateEmbeddings([
        "Find fatal errors, agent execution failures, timeouts, 400 status codes, crash stack traces, and high severity warnings.",
      ]);
      const vectorMatches = await deps.env.VECTORIZE_LOGS.query(queryEmbeddings[0], {
        topK: 10,
        filter: { runId },
        returnValues: false,
        returnMetadata: true,
      });

      stringifiedDetails = `[RAG FETCHED RELEVANT LOG CHUNKS]\n${vectorMatches.matches
        .map((match) => match.metadata?.content)
        .filter(Boolean)
        .join("\n\n---\n\n")}`;
    } catch {
      stringifiedDetails = `${stringifiedDetails.substring(0, MAX_LOG_LENGTH)}\n...[TRUNCATED]`;
    }
  } else if (stringifiedDetails.length > MAX_LOG_LENGTH) {
    stringifiedDetails = `${stringifiedDetails.substring(0, MAX_LOG_LENGTH)}\n...[TRUNCATED]`;
  }

  const prompt = `Health Check Failed for worker: ${target.workerName}\nCategory: ${input.failure.type}\nSource: ${input.source}\nError: ${input.failure.message}\nDetails: ${stringifiedDetails}\n\nRelevant Cloudflare Docs Context:\nQuery: ${mcpQuery}\nDocs Result: ${mcpContext}`;

  // Build tools — all scoped to the TARGET worker's repo
  const tools: AgentTool[] = [
    {
      name: "check_duplicate_pr",
      description: `Check for identical active pull requests or database records for ${repoOwner}/${repoName}.`,
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      execute: async () => {
        try {
          if (!deps.agent) throw new Error("Agent instance required for RPC");
          const githubAgent = (deps.agent as any).getPeerAgent((deps.env as any).GITHUB_AGENT);
          const prs = await githubAgent.checkDuplicatePR(repoOwner, repoName, "");

          // Check local DB for recent diagnosis actions on this target
          const db = getDb(deps.env.DB);
          const recentFailures = await db
            .select()
            .from(healthResults)
            .where(eq(healthResults.status, "failure"))
            .orderBy(desc(healthResults.timestamp))
            .limit(10);
          const recentAiSuggestions = recentFailures
            .filter((f) => f.ai_suggestion?.includes("github.com"))
            .map((f) => ({ target: f.name, suggestion: f.ai_suggestion }));
          return { activePullRequests: prs, recentDatabaseActions: recentAiSuggestions };
        } catch (error: any) {
          return { error: error.message };
        }
      },
    },
    {
      name: "get_github_file",
      description: `Fetch file content from the TARGET repo (${repoOwner}/${repoName}).`,
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
      execute: async (args: Record<string, unknown>) => {
        try {
          if (!deps.agent) throw new Error("Agent instance required for RPC");
          const githubAgent = (deps.agent as any).getPeerAgent((deps.env as any).GITHUB_AGENT);
          return await githubAgent.getFileContent(repoOwner, repoName, String(args.path || ""));
        } catch (error: any) {
          return `Failed to fetch file: ${error.message}`;
        }
      },
    },
    {
      name: "create_pull_request",
      description: `Create a pull request on the TARGET repo (${repoOwner}/${repoName}).`,
      parameters: {
        type: "object",
        properties: {
          branchName: { type: "string" },
          filePath: { type: "string" },
          newContent: { type: "string" },
          commitMessage: { type: "string" },
          prTitle: { type: "string" },
          prBody: { type: "string" },
        },
        required: ["branchName", "filePath", "newContent", "commitMessage", "prTitle", "prBody"],
        additionalProperties: false,
      },
      execute: async (args: Record<string, unknown>) => {
        try {
          if (!deps.agent) throw new Error("Agent instance required for RPC");
          const githubAgent = (deps.agent as any).getPeerAgent((deps.env as any).GITHUB_AGENT);
          
          const prUrl = await githubAgent.createPullRequest({
            owner: repoOwner,
            repo: repoName,
            branchName: String(args.branchName || ""),
            filePath: String(args.filePath || ""),
            newContent: String(args.newContent || ""),
            commitMessage: String(args.commitMessage || ""),
            prTitle: String(args.prTitle || ""),
            prBody: String(args.prBody || "")
          });

          return `Successfully created PR: ${prUrl}`;
        } catch (error: any) {
          return `PR Creation failed: ${error.message}`;
        }
      },
    },
    {
      name: "delegate_to_jules",
      description: `Delegate fixing the issue to Jules for the TARGET repo (${repoOwner}/${repoName}).`,
      parameters: { type: "object", properties: { prompt: { type: "string" }, autoPr: { type: "boolean" } }, required: ["prompt"], additionalProperties: false },
      execute: async (args: Record<string, unknown>) => {
        try {
          if (!deps.agent) throw new Error("Agent instance required for RPC");
          const engineerAgent = (deps.agent as any).getPeerAgent((deps.env as any).ENGINEER_AGENT);

          const promptText = String(args.prompt || "");
          const sprint = {
            id: `diag-${Date.now()}`,
            requestId: `req-${Date.now()}`,
            title: `Fix Health Issue in ${target.workerName}: ${input.failure.message.substring(0, 60)}`,
            subtasks: [
              {
                id: `sub-${Date.now()}`,
                description: promptText,
                role: 'swe' as any,
                status: 'pending' as any
              }
            ]
          };

          await engineerAgent.assignSprint(sprint);

          // Record the Jules job — linked to the fleet observation
          const db = getDb(deps.env.DB);
          await db.insert(julesJobs).values({
            sessionId: sprint.id,
            repoFullName: `${repoOwner}/${repoName}`,
            prompt: promptText,
            status: "pending",
          });
          return `Successfully delegated to EngineerAgent Sprint for ${target.workerName}. Sprint ID: ${sprint.id}`;
        } catch (error: any) {
          return `Delegation failed: ${error.message}`;
        }
      },
    },
  ];

  try {
    const finalData = await deps.ai.generateStructuredResponse<HealthDiagnosticianOutput>(
      prompt,
      HealthDiagnosticianOutputSchema,
      instructions + deps.ai.buildToolInstructions(tools),
      { skills: ["continuous-learning", "architecture"] }
    );
    return finalData;
  } catch (error: any) {
    return {
      severity: "high",
      rootCause: `Agent execution failed for ${target.workerName}: ${error.message}`,
      suggestedFix: "Review raw logs. The agent encountered a fatal error during the diagnostic loop.",
      prUrl: null,
    };
  }
}
