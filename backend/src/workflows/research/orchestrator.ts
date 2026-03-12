/**
 * @file backend/src/workflows/research/orchestrator.ts
 * @description Multi-stage research orchestration workflow using Orchestrator-Workers pattern
 * @owner Research Team
 * 
 * Pipeline:
 * 1. Parallel Exploration - Identify candidate repos with fast workers
 * 2. HITL Pause - Wait for human approval
 * 3. Deep Dive - Detailed analysis with sandbox testing
 * 4. LLM-as-Judge - Final scoring and evaluation
 * 5. Vectorization - Index insights for future queries
 */

import { AgentWorkflow, type AgentWorkflowEvent, type AgentWorkflowStep } from "@/ai/agents/runtime/workflows";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  ResearchWorkflowParams,
  CandidateRepo,
  DeepAnalysis,
  JudgeScore,
} from "@/schemas/research";
import { getOctokit } from "@/services/octokit/core";
import { generateUuid } from "@/utils/common";

export class ResearchOrchestrator extends AgentWorkflow<any, ResearchWorkflowParams> {
  
  /**
   * Universal executor for structured Agent runs.
   * Dynamically imports the heavy SDKs to preserve sub-50ms workflow cold starts.
   */
  private async executeAgent<T>(
    name: string,
    model: string,
    system: string,
    prompt: string,
    outputSchema: z.ZodType<T>
  ): Promise<T> {
    const { Agent, run } = await import("@/ai/agents/runtime/openai");

    const agent = new Agent({
      name,
      model,
      instructions: system,
      outputType: outputSchema,
      env: this.env,
    });

    const result = await run(agent, prompt);
    return result.finalOutput as T;
  }

  async run(
    event: Readonly<AgentWorkflowEvent<ResearchWorkflowParams>>,
    step: AgentWorkflowStep
  ) {
    const { mode, query, maxCandidates, requireApproval } = event.payload;

    // Create research session
    const sessionId = await step.do("create-session", async () => {
      const db = getDb(this.env.DB_WEBHOOKS);
      const [session] = await db
        .insert(schema.researchSessions)
        .values({
          id: generateUuid(),
          mode,
          query: query || null,
          status: "exploring",
          startedAt: new Date(),
        })
        .returning();
      return session.id;
    });

    console.log(`[Orchestrator] Session ${sessionId} started - Mode: ${mode}`);
    
    // Non-durable progress reporting for connected Agent clients
    await this.reportProgress({
      step: "parallel-exploration",
      status: "running",
      message: `Identifying up to ${maxCandidates} candidate repositories...`
    });

    // Step 1: Parallel Exploration
    const candidates = await step.do("parallel-exploration", async () => {
      console.log(`[Orchestrator] Identifying ${maxCandidates} candidate repos...`);

      const orchestratorPrompt = `Task: Identify ${maxCandidates} GitHub repositories that match: ${query || "trending repositories in the last week"}

For each repository, provide:
- owner: Repository owner username
- repo: Repository name
- stars: Estimated star count
- description: Brief description
- language: Primary programming language
- sampleScore: Initial quality score (0-1) based on stars, activity, and relevance
- reasoning: Why this repository was selected`;

      const candidateSchema = z.object({
        repositories: z.array(
          z.object({
            owner: z.string(),
            repo: z.string(),
            stars: z.number(),
            description: z.string(),
            language: z.string().nullable(),
            sampleScore: z.number().min(0).max(1),
            reasoning: z.string(),
          })
        ),
      });

      const result = await this.executeAgent<{ repositories: CandidateRepo[] }>(
        "ParallelExplorer",
        "workers-ai/@cf/openai/gpt-oss-120b",
        "You are a GitHub repository analyst. Return structured data.",
        orchestratorPrompt,
        candidateSchema
      );

      const candidateList = result.repositories || [];

      // Spawn parallel workers to validate each repo
      const validationPromises = candidateList.map(async (candidate: CandidateRepo) => {
        return await this.validateRepository(candidate);
      });

      const validated = await Promise.all(validationPromises);
      return validated.filter((c) => c.sampleScore > 0.5); // Filter low-scoring candidates
    });

    console.log(`[Orchestrator] Found ${candidates.length} valid candidates`);

    // Store candidates in D1
    await step.do("store-candidates", async () => {
      const db = getDb(this.env.DB_WEBHOOKS);
      for (const candidate of candidates) {
        await db.insert(schema.repoScores).values({
          id: generateUuid(),
          sessionId,
          owner: candidate.owner,
          repo: candidate.repo,
          repoId: `${candidate.owner}/${candidate.repo}`,
          sampleScore: candidate.sampleScore,
          sampleReasoning: candidate.reasoning,
          status: "pending_approval",
        });

        // Store sampling artifact
        await db.insert(schema.analysisArtifacts).values({
          id: generateUuid(),
          sessionId,
          repoId: `${candidate.owner}/${candidate.repo}`,
          artifactType: "sample",
          content: JSON.stringify(candidate),
        });
      }
    });

    // Step 2: HITL Pause (if required)
    if (requireApproval) {
      await step.do("hitl-pause-db-update", async () => {
        const db = getDb(this.env.DB_WEBHOOKS);
        await db
          .update(schema.researchSessions)
          .set({ status: "awaiting_approval" })
          .where(eq(schema.researchSessions.id, sessionId));
      });
      
      await this.reportProgress({
        step: "approval",
        status: "pending",
        message: "Awaiting human approval to proceed with deep dive."
      });

      console.log(`[Orchestrator] Waiting for human approval via AgentWorkflow...`);

      // Native AgentWorkflow HITL Pause (Throws WorkflowRejectedError if rejected)
      const approval = await this.waitForApproval<{ approvedBy: string }>(step, {
        timeout: "24 hours",
      });

      console.log(`[Orchestrator] Approval received from ${approval?.approvedBy || "Admin"}, continuing...`);
    }

    // Update session status
    await step.do("update-status-analyzing", async () => {
      const db = getDb(this.env.DB_WEBHOOKS);
      await db
        .update(schema.researchSessions)
        .set({ status: "analyzing" })
        .where(eq(schema.researchSessions.id, sessionId));
    });

    await this.reportProgress({ step: "deep-dive", status: "running" });

    // Step 3: Deep Dive with Sandbox
    const analyses = await step.do("deep-dive", async () => {
      console.log(`[Orchestrator] Performing deep analysis...`);
      const analysisPromises = candidates.map(async (candidate) => {
        return await this.deepAnalyze(candidate, sessionId);
      });
      return await Promise.all(analysisPromises);
    });

    console.log(`[Orchestrator] Completed ${analyses.length} deep analyses`);
    
    await this.reportProgress({ step: "llm-judge", status: "running" });

    // Step 4: LLM-as-Judge
    const scores = await step.do("llm-judge", async () => {
      console.log(`[Orchestrator] Evaluating with LLM-as-Judge...`);
      const judgePromises = analyses.map(async (analysis) => {
        return await this.judgeAnalysis(analysis, sessionId);
      });
      return await Promise.all(judgePromises);
    });

    console.log(`[Orchestrator] Judge scored ${scores.length} repositories`);

    // Step 5: Vectorize insights
    await step.do("vectorize-insights", async () => {
      console.log(`[Orchestrator] Vectorizing insights...`);
      for (const analysis of analyses) {
        const embedding = (await this.env.AI.run(
          "@cf/baai/bge-large-en-v1.5",
          { text: analysis.summary }
        )) as any;

        await this.env.RESEARCH_INDEX.upsert([
          {
            id: `analysis:${sessionId}:${analysis.repoId}`,
            values: embedding.data[0],
            metadata: {
              sessionId,
              repoId: analysis.repoId,
              summary: analysis.summary.substring(0, 500),
              codeQuality: analysis.codeQuality,
              modularity: analysis.modularity,
            },
          },
        ]);
      }
    });

    // Mark session complete
    await step.do("complete-session", async () => {
      const db = getDb(this.env.DB_WEBHOOKS);
      await db
        .update(schema.researchSessions)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(schema.researchSessions.id, sessionId));
    });

    console.log(`[Orchestrator] Session ${sessionId} completed successfully`);

    const finalResult = {
      sessionId,
      candidatesFound: candidates.length,
      analysesCompleted: analyses.length,
      scores,
    };
    
    await step.reportComplete(finalResult);
    return finalResult;
  }

  /**
   * Validate a repository using fast worker model
   */
  private async validateRepository(
    candidate: CandidateRepo
  ): Promise<CandidateRepo> {
    try {
      const octokit = await getOctokit(this.env);
      const repo = await octokit.repos.get({
        owner: candidate.owner,
        repo: candidate.repo,
      });

      return {
        ...candidate,
        stars: repo.data.stargazers_count,
        description: repo.data.description || candidate.description,
        language: repo.data.language || null,
      };
    } catch (error) {
      console.warn(`[Orchestrator] Failed to validate ${candidate.owner}/${candidate.repo}:`, error);
      return { ...candidate, sampleScore: 0 }; 
    }
  }

  /**
   * Perform deep analysis with structured AI response
   */
  private async deepAnalyze(
    candidate: CandidateRepo,
    sessionId: string
  ): Promise<DeepAnalysis> {
    let readmeContent = "";
    try {
      const octokit = await getOctokit(this.env);
      const readme = await octokit.repos.getReadme({
        owner: candidate.owner,
        repo: candidate.repo,
      });
      readmeContent = Buffer.from((readme.data as any).content, "base64").toString("utf8");
    } catch (error) {
      console.warn(`[Orchestrator] No README found for ${candidate.owner}/${candidate.repo}`);
    }

    const analysisPrompt = `Perform a deep technical analysis of the GitHub repository: ${candidate.owner}/${candidate.repo}

Description: ${candidate.description}
Language: ${candidate.language}
Stars: ${candidate.stars}

README Content:
${readmeContent.substring(0, 2000)}

Evaluate the following aspects (score 0-10 each):
1. Code Quality - Clean code, best practices, documentation
2. Modularity - Separation of concerns, reusability
3. Performance - Optimization techniques, efficiency
4. Security - Best practices, vulnerability management

Provide a technical summary explaining your scores.`;

    const deepAnalysisSchema = z.object({
      codeQuality: z.number().min(0).max(10),
      modularity: z.number().min(0).max(10),
      performance: z.number().min(0).max(10),
      security: z.number().min(0).max(10),
      summary: z.string(),
    });

    const analysis = await this.executeAgent<Omit<DeepAnalysis, "repoId" | "artifacts">>(
      "DeepDiveAnalyst",
      "workers-ai/@cf/openai/gpt-oss-120b",
      "You are an expert code reviewer. Provide structured analysis.",
      analysisPrompt,
      deepAnalysisSchema
    );

    const db = getDb(this.env.DB_WEBHOOKS);
    const artifactId = generateUuid();

    await db.insert(schema.analysisArtifacts).values({
      id: artifactId,
      sessionId,
      repoId: `${candidate.owner}/${candidate.repo}`,
      artifactType: "deep_analysis",
      content: JSON.stringify(analysis),
    });

    await db
      .update(schema.repoScores)
      .set({
        codeQuality: analysis.codeQuality,
        modularity: analysis.modularity,
        performance: analysis.performance,
        security: analysis.security,
        analysisSummary: analysis.summary,
        status: "analyzed",
      })
      .where(eq(schema.repoScores.repoId, `${candidate.owner}/${candidate.repo}`));

    return {
      repoId: `${candidate.owner}/${candidate.repo}`,
      ...analysis,
      artifacts: [artifactId],
    };
  }

  /**
   * LLM-as-Judge evaluation with scoring rubric
   */
  private async judgeAnalysis(
    analysis: DeepAnalysis,
    sessionId: string
  ): Promise<JudgeScore> {
    const rubric = `Scoring Rubric (0-10 scale):
- Logic & Architecture: Code organization, design patterns, scalability
- Modularity & Reusability: Component separation, DRY principles
- Performance Optimization: Efficiency, resource usage, caching
- Security Best Practices: Input validation, authentication, vulnerability management

Current Scores:
- Code Quality: ${analysis.codeQuality}/10
- Modularity: ${analysis.modularity}/10
- Performance: ${analysis.performance}/10
- Security: ${analysis.security}/10

Analysis Summary:
${analysis.summary}

Provide:
1. Overall score (0-10) - weighted average with your judgment
2. Detailed reasoning for the score
3. Key strengths (array of strings)
4. Key weaknesses (array of strings)
5. Recommendation: "highly_relevant", "relevant", or "not_relevant"`;

    const judgeSchema = z.object({
      overallScore: z.number().min(0).max(10),
      reasoning: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      recommendation: z.enum(["highly_relevant", "relevant", "not_relevant"]),
    });

    const score = await this.executeAgent<Omit<JudgeScore, "repoId">>(
      "LLMJudge",
      "workers-ai/@cf/openai/gpt-oss-120b",
      "You are an expert code reviewer and judge. Evaluate repositories objectively.",
      rubric,
      judgeSchema
    );

    const db = getDb(this.env.DB_WEBHOOKS);

    await db.insert(schema.analysisArtifacts).values({
      id: generateUuid(),
      sessionId,
      repoId: analysis.repoId,
      artifactType: "judge_score",
      content: JSON.stringify(score),
    });

    await db
      .update(schema.repoScores)
      .set({
        finalScore: score.overallScore,
        judgeReasoning: score.reasoning,
        strengths: JSON.stringify(score.strengths),
        weaknesses: JSON.stringify(score.weaknesses),
        recommendation: score.recommendation,
        status: "scored",
      })
      .where(eq(schema.repoScores.repoId, analysis.repoId));

    return {
      repoId: analysis.repoId,
      ...score,
    };
  }
}
