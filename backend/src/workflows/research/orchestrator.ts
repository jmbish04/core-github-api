/**
 * @file backend/src/workflows/ResearchOrchestrator.ts
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

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import {
  ResearchWorkflowParams,
  CandidateRepo,
  DeepAnalysis,
  JudgeScore,
} from "@/schemas/research";
import { getOctokit } from "@/services/octokit/core";
import OpenAI from "openai";
import { generateUuid } from "@/utils/common";

export class ResearchOrchestrator extends WorkflowEntrypoint<
  Env,
  ResearchWorkflowParams
> {
  async run(
    event: Readonly<WorkflowEvent<ResearchWorkflowParams>>,
    step: WorkflowStep
  ) {
    // Extract params from event.payload
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

    // Step 1: Parallel Exploration
    const candidates = await step.do("parallel-exploration", async () => {
      console.log(
        `[Orchestrator] Identifying ${maxCandidates} candidate repos...`
      );

      // Get AI Gateway client
      const aiClient = await this.getAIGatewayClient();

      // Use Orchestrator AI to identify candidates with structured response
      const orchestratorPrompt = `You are a research orchestrator analyzing GitHub repositories.

Task: Identify ${maxCandidates} GitHub repositories that match: ${query || "trending repositories in the last week"}

For each repository, provide:
- owner: Repository owner username
- repo: Repository name
- stars: Estimated star count
- description: Brief description
- language: Primary programming language
- sampleScore: Initial quality score (0-1) based on stars, activity, and relevance
- reasoning: Why this repository was selected

Return ONLY the JSON array, no additional text.`;

      const response = await aiClient.chat.completions.create({
        model: "workers-ai/@cf/openai/gpt-oss-120b",
        messages: [
          {
            role: "system",
            content:
              "You are a GitHub repository analyst. Return structured JSON only.",
          },
          { role: "user", content: orchestratorPrompt },
        ],
        max_tokens: 4096,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "candidate_repos",
            schema: {
              type: "object",
              properties: {
                repositories: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      owner: { type: "string" },
                      repo: { type: "string" },
                      stars: { type: "number" },
                      description: { type: "string" },
                      language: { type: "string", nullable: true },
                      sampleScore: { type: "number", minimum: 0, maximum: 1 },
                      reasoning: { type: "string" },
                    },
                    required: [
                      "owner",
                      "repo",
                      "stars",
                      "description",
                      "language",
                      "sampleScore",
                      "reasoning",
                    ],
                  },
                },
              },
              required: ["repositories"],
            },
          },
        },
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      const candidateList = result.repositories || [];

      // Spawn parallel workers to validate each repo
      const validationPromises = candidateList.map(
        async (candidate: CandidateRepo) => {
          return await this.validateRepository(candidate);
        }
      );

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
      await step.do("hitl-pause", async () => {
        console.log(`[Orchestrator] Waiting for human approval...`);

        const db = getDb(this.env.DB_WEBHOOKS);
        await db
          .update(schema.researchSessions)
          .set({ status: "awaiting_approval" })
          .where(eq(schema.researchSessions.id, sessionId));
      });

      // Pause workflow until external signal (24 hour timeout)
      await step.sleep("wait-for-approval", "24 hours");

      // Check if approved
      const approved = await step.do("check-approval", async () => {
        const db = getDb(this.env.DB_WEBHOOKS);
        const session = await db.query.researchSessions.findFirst({
          where: eq(schema.researchSessions.id, sessionId),
        });

        if (session?.status !== "approved") {
          throw new Error("Research session not approved within 24 hours");
        }
        return true;
      });

      console.log(`[Orchestrator] Approval received, continuing...`);
    }

    // Update session status
    await step.do("update-status-analyzing", async () => {
      const db = getDb(this.env.DB_WEBHOOKS);
      await db
        .update(schema.researchSessions)
        .set({ status: "analyzing" })
        .where(eq(schema.researchSessions.id, sessionId));
    });

    // Step 3: Deep Dive with Sandbox
    const analyses = await step.do("deep-dive", async () => {
      console.log(`[Orchestrator] Performing deep analysis...`);

      const analysisPromises = candidates.map(async (candidate) => {
        return await this.deepAnalyze(candidate, sessionId);
      });

      return await Promise.all(analysisPromises);
    });

    console.log(`[Orchestrator] Completed ${analyses.length} deep analyses`);

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
          {
            text: analysis.summary,
          }
        )) as any;

        await this.env.RESEARCH_INDEX.upsert([
          {
            id: `analysis:${sessionId}:${analysis.repoId}`,
            values: embedding.data[0],
            metadata: {
              sessionId,
              repoId: analysis.repoId,
              summary: analysis.summary.substring(0, 500), // Limit metadata size
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

    return {
      sessionId,
      candidatesFound: candidates.length,
      analysesCompleted: analyses.length,
      scores,
    };
  }

  /**
   * Get AI Gateway client for structured responses
   */
  private async getAIGatewayClient(): Promise<OpenAI> {
    const gatewayUrl = await this.env.AI.gateway("default-gateway").getUrl(
      "compat"
    );
    const apiToken = await this.env.AI_GATEWAY_TOKEN.get();

    return new OpenAI({
      apiKey: apiToken || "",
      baseURL: gatewayUrl,
    });
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

      // Update with real data
      return {
        ...candidate,
        stars: repo.data.stargazers_count,
        description: repo.data.description || candidate.description,
        language: repo.data.language,
      };
    } catch (error) {
      console.warn(
        `[Orchestrator] Failed to validate ${candidate.owner}/${candidate.repo}:`,
        error
      );
      return { ...candidate, sampleScore: 0 }; // Mark as invalid
    }
  }

  /**
   * Perform deep analysis with structured AI response
   */
  private async deepAnalyze(
    candidate: CandidateRepo,
    sessionId: string
  ): Promise<DeepAnalysis> {
    const aiClient = await this.getAIGatewayClient();

    // Fetch README for context
    let readmeContent = "";
    try {
      const octokit = await getOctokit(this.env);
      const readme = await octokit.repos.getReadme({
        owner: candidate.owner,
        repo: candidate.repo,
      });
      readmeContent = Buffer.from(
        (readme.data as any).content,
        "base64"
      ).toString("utf8");
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

    const response = await aiClient.chat.completions.create({
      model: "workers-ai/@cf/openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content:
            "You are an expert code reviewer. Provide structured analysis.",
        },
        { role: "user", content: analysisPrompt },
      ],
      max_tokens: 4096,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "deep_analysis",
          schema: {
            type: "object",
            properties: {
              codeQuality: { type: "number", minimum: 0, maximum: 10 },
              modularity: { type: "number", minimum: 0, maximum: 10 },
              performance: { type: "number", minimum: 0, maximum: 10 },
              security: { type: "number", minimum: 0, maximum: 10 },
              summary: { type: "string" },
            },
            required: [
              "codeQuality",
              "modularity",
              "performance",
              "security",
              "summary",
            ],
          },
        },
      },
    });

    const analysis = JSON.parse(response.choices[0].message.content || "{}");

    // Store in D1
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
      .where(
        eq(schema.repoScores.repoId, `${candidate.owner}/${candidate.repo}`)
      );

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
    const aiClient = await this.getAIGatewayClient();

    const rubric = `
Scoring Rubric (0-10 scale):
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
5. Recommendation: "highly_relevant", "relevant", or "not_relevant"
`;

    const response = await aiClient.chat.completions.create({
      model: "workers-ai/@cf/openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content:
            "You are an expert code reviewer and judge. Evaluate repositories objectively.",
        },
        { role: "user", content: rubric },
      ],
      max_tokens: 4096,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "judge_score",
          schema: {
            type: "object",
            properties: {
              overallScore: { type: "number", minimum: 0, maximum: 10 },
              reasoning: { type: "string" },
              strengths: { type: "array", items: { type: "string" } },
              weaknesses: { type: "array", items: { type: "string" } },
              recommendation: {
                type: "string",
                enum: ["highly_relevant", "relevant", "not_relevant"],
              },
            },
            required: [
              "overallScore",
              "reasoning",
              "strengths",
              "weaknesses",
              "recommendation",
            ],
          },
        },
      },
    });

    const score = JSON.parse(response.choices[0].message.content || "{}");

    // Store in D1
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
