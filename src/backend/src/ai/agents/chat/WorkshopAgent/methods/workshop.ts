/**
 * @file WorkshopAgent/methods/workshop.ts
 * @description Core WorkshopAgent methods — chat, orchestration, repository
 *              initialization, and plan ingestion. Pure functions with DI.
 */
import { eq } from "drizzle-orm";
import { getDb, workshopProjects, workshopProjectTasks } from "@db";
import { createOrGetRepositoryForProject } from "@services/repository-sync";
import {
  runStructuredChat,
  EdigraphService,
  type StructuredChatResult,
  type AgentStateStore,
  type AIProvider,
} from "@/ai/providers";
import { z } from "zod";
import { withFullCodeOutputRules } from "@/ai/utils/code-output-rules";
import type { WorkshopAgentState } from "../types";

const AGENT_NAME = 'WorkshopAgent';

// ── Types ──────────────────────────────────────────────────────────────
type WorkshopDeps = {
  ai: AIProvider;
  store: AgentStateStore<WorkshopAgentState>;
  env: Env;
};

// ── Private Helpers ────────────────────────────────────────────────────

async function getSystemPromptBase(): Promise<string> {
  return withFullCodeOutputRules(`You are the Workshop Orchestrator, an expert Cloudflare Workers architect.
Your responsibilities:
- Analyse user project requirements and decompose them into phased tasks.
- Coordinate specialist agents (Database, API, Frontend, AI) to build complete Cloudflare Worker applications.
- Ensure all generated plans are aligned with Drizzle ORM, Hono, and Astro best practices.
- Track project state via the WorkshopAgent Durable Object and persist progress to D1.
Always respond with structured, actionable output that can be rendered in the Workshop Wizard UI.

## Skills applied
Apply these skills in every response:
- **plan-writing**: Break tasks into phases with clear dependencies and verification criteria.
- **architecture**: Evaluate trade-offs before recommending any approach. Document ADR-style decisions.
- **clean-code**: Concise, self-documenting code. No over-engineering, no unnecessary comments.
- **workers-best-practices**: No floating promises, no global mutable state, stream responses where possible, use bindings correctly.
- **agents-sdk**: Cloudflare Agents SDK patterns — Agent class, Durable Object state, callable RPC, Workflow integration.
- **database-design**: Drizzle ORM schema design, indexing strategy, D1 query patterns.
- **api-patterns**: Hono RPC, typed response schemas, versioning, input validation via Zod.`);
}

// ── Methods ────────────────────────────────────────────────────────────

export async function chat(
  deps: WorkshopDeps,
  message: string,
  history: unknown[] = [],
  context?: unknown,
  source = "api",
  sessionId = "default",
  requestedModel?: string,
  agentInstanceId?: string,
): Promise<StructuredChatResult> {
  // ── Load D1 config ──────────────────────────────────────────────────────
  const cfg = await deps.ai.getAgentFunctionConfig(AGENT_NAME, 'chat');

  // ── EdigraphService: fire-and-forget episodic memory ───────────────────
  if (deps.env.EDGRAPH && agentInstanceId) {
    deps.store.logger.info('Saving episodic memory for WorkshopAgent chat');
    // @ts-ignore — EDGRAPH is a Fetcher service binding
    const memory = new EdigraphService(deps.env.EDGRAPH, agentInstanceId);
    void memory.addEpisodic(message, { role: 'user', function: 'chat', agent: AGENT_NAME }).catch(() => {});
  }

  const systemPrompt = cfg?.systemInstructions ?? await getSystemPromptBase();

  return runStructuredChat({
    ai: deps.ai,
    store: deps.store,
    agentName: AGENT_NAME,
    systemPrompt,
    message,
    history,
    context,
    source,
    sessionId,
    requestedModel: requestedModel ?? cfg?.primaryModel ?? undefined,
    skills: ['spec-writing', 'planning', 'task-decomposition'],
  });
}

export async function orchestrateTasks(
  deps: WorkshopDeps,
  projectId: string,
): Promise<{ success: boolean; message: string }> {
  deps.store.logger.info(`Orchestrating tasks for project ${projectId}`);
  
  // A5 & A6: Full jules-stitch loop with Guardrail consultation
  // 1. Design → 2. CF analysis → 3. Provisioning → 4. Engineer → 5. Guardrail review
  // All via @callable() RPC.
  
  // NOTE: This represents the high-level control flow for the jules-stitch loop.
  // It relies on RPC across BaseChatAgent instances.
  // 
  // const stitchAgent = deps.store.getPeerAgent("DesignAgent");
  // const cfAgent = deps.store.getPeerAgent("CloudflareAgent");
  // const engineerAgent = deps.store.getPeerAgent("EngineerAgent");
  // const guardrailAgent = deps.store.getPeerAgent("GuardrailAgent");
  // ... (Full loop implementation orchestrating across peers)

  return { success: true, message: "Tasks orchestrated via jules-stitch loop (stubbed)" };
}

export async function initializeRepository(
  deps: WorkshopDeps,
  projectId: string,
  params: {
    owner?: string;
    description?: string;
    visibility?: "public" | "private";
  },
): Promise<{ success: boolean; repoUrl: string }> {
  deps.store.logger.info(`Initializing repository for project ${projectId}`);

  const db = getDb(deps.env.DB);
  const proj = await db
    .select()
    .from(workshopProjects)
    .where(eq(workshopProjects.id, projectId))
    .limit(1);

  if (!proj[0]) {
    throw new Error(`Project ${projectId} not found.`);
  }

  const repoCreation = await createOrGetRepositoryForProject(deps.env, {
    projectName: proj[0].name,
    description: params.description,
    owner: params.owner,
    visibility: params.visibility,
  });

  const repoUrl = `https://github.com/${repoCreation.owner}/${repoCreation.repoName}`;
  await db
    .update(workshopProjects)
    .set({ status: "active", repoUrl })
    .where(eq(workshopProjects.id, projectId));

  await deps.store.set({
    ...deps.store.state,
    activeProjectId: projectId,
    status: "completed",
    lastResult: { repoUrl },
    history: [
      ...deps.store.state.history,
      { type: "repository_initialized", projectId, repoUrl },
    ],
  });

  return { success: true, repoUrl };
}

export async function ingestProjectPlan(
  deps: WorkshopDeps,
  projectId: string,
  jsonPayload: string,
): Promise<any> {
  const cfg = await deps.ai.getAgentFunctionConfig(AGENT_NAME, 'generateSpec');
  const systemPrompt = cfg?.systemInstructions ?? await getSystemPromptBase();
  const prompt = `You are a strict JSON parser for specialist workshop agents. Validate and extract the exact fields required by the Project Tasks Schema.
Ensure project_name, generated_date, total_phases, and the deeply nested phases array are perfectly formatted.
Payload: ${jsonPayload}`;

  const ProjectPlanSchema = z.object({
    project_name: z.string(),
    generated_date: z.string().optional(),
    total_phases: z.number(),
    phases: z.array(z.any()),
  });

  const parsedData = await deps.ai.generateStructuredResponse(
    prompt,
    ProjectPlanSchema,
    systemPrompt,
    {
      model: cfg?.primaryModel ?? undefined,
      provider: cfg?.primaryProvider ?? undefined,
      skills: ['spec-writing', 'planning', 'task-decomposition'],
    }
  );

  const db = getDb(deps.env.DB);
  await db
    .delete(workshopProjectTasks)
    .where(eq(workshopProjectTasks.projectId, projectId));
    
  await db.insert(workshopProjectTasks).values({
    id: crypto.randomUUID(),
    projectId,
    projectName: parsedData.project_name,
    generatedDate: parsedData.generated_date || new Date().toISOString(),
    totalPhases: parsedData.total_phases,
    phases: parsedData.phases,
  });

  await deps.store.set({
    ...deps.store.state,
    activeProjectId: projectId,
    status: "completed",
    lastResult: parsedData,
    history: [
      ...deps.store.state.history,
      { type: "project_plan_ingested", projectId },
    ],
  });

  return parsedData;
}
