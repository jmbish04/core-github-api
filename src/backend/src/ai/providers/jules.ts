/**
 * Jules SDK Integration
 * 
 * Provides an AI interface through the Google Jules API. 
 * Polyfills missing native features (e.g. strict JSON outputs) by
 * piping broad outputs via `workerAi`.
 */
import * as workerAi from "./worker-ai";
import { z } from "zod";
import { getDb } from "@db";
import { eq } from "drizzle-orm";
import { planningRequests, planningRequestsUpscaling, planResponses } from "@/db/schemas/workshop/plan_tracking";
import { persistDerivedPlansFromMarkdown } from "@/services/planning/honi-babysitter";
import { rewriteQuestionForMCP, generateStructuredResponse as indexGenerateStructured, FileInput, AIOptions, TextWithToolsResponse, StructuredWithToolsResponse } from "./index";

let jules: any;
async function initJules() {
  if (jules) return jules;
  try {
    const julesSDK = await import("@google/jules-sdk");
    jules = julesSDK.jules;
    return jules;
  } catch(e) { 
    console.error("Jules SDK not available", JSON.stringify(e));
    throw new Error("Jules SDK not available");
  }
}

export async function verifyApiKey(_env: Env): Promise<boolean> {
  return true; // Assume true since local dev usually has ADC or the CLI handles auth
}

export async function generateText(_env: Env, prompt: string, systemPrompt?: string, _options?: AIOptions): Promise<string> {
  const basePrompt = systemPrompt ? `System: ${systemPrompt}\n\nUser: ${prompt}` : prompt;
  await initJules();

  const julesSession = await jules.session({ prompt: basePrompt });
  let julesOutput = "";
  for await (const activity of julesSession.stream()) {
    if (activity.type === 'agentMessaged') julesOutput += activity.message + "\n";
  }
  return julesOutput.trim();
}

/**
 * Polyfill: Jules processes heavy context natively, 
 * then Worker AI strictly filters and forces the JSON format via Zod schema natively.
 */
export async function generateStructuredResponse<T>(env: Env, prompt: string, schema: z.ZodType<T>, systemPrompt?: string, options?: AIOptions): Promise<T> {
  const basePrompt = systemPrompt ? `System: ${systemPrompt}\n\nUser: ${prompt}` : prompt;
  await initJules();

  const julesSession = await jules.session({ prompt: `${basePrompt}\n\nProvide output clearly so it can be parsed as JSON.` });
  let julesOutput = "";
  for await (const activity of julesSession.stream()) {
    if (activity.type === 'agentMessaged') julesOutput += activity.message + "\n";
  }
  
  const extractionPrompt = `Extract and strictly format the following data into the required JSON schema:\n\n${julesOutput}`;
  return await workerAi.generateStructuredResponse<T>(env, extractionPrompt, schema, "You are a rigid JSON formatting tool.", options);
}

export async function generateTextWithTools(
  env: Env,
  prompt: string,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<TextWithToolsResponse> {
  const basePrompt = systemPrompt ? `System: ${systemPrompt}\n\nUser: ${prompt}` : prompt;
  await initJules();

  const julesSession = await jules.session({ prompt: basePrompt });
  let julesOutput = "";
  for await (const activity of julesSession.stream()) {
    if (activity.type === 'agentMessaged') julesOutput += activity.message + "\n";
  }
  
  return await workerAi.generateTextWithTools(env, julesOutput, tools, "Extract tool calls from the following input.", options);
}

export async function generateStructuredWithTools<T>(
  env: Env,
  prompt: string,
  schema: z.ZodType<T>,
  tools: any[],
  systemPrompt?: string,
  options?: AIOptions
): Promise<StructuredWithToolsResponse<T>> {
  const basePrompt = systemPrompt ? `System: ${systemPrompt}\n\nUser: ${prompt}` : prompt;
  await initJules();

  const julesSession = await jules.session({ prompt: `${basePrompt}\n\nProvide output clearly so it can be parsed as JSON.` });
  let julesOutput = "";
  for await (const activity of julesSession.stream()) {
    if (activity.type === 'agentMessaged') julesOutput += activity.message + "\n";
  }

  const extractionPrompt = `Extract and strictly format the following data into the required JSON schema, and extract any tool calls:\n\n${julesOutput}`;
  return await workerAi.generateStructuredWithTools<T>(env, extractionPrompt, schema, tools, "You are a rigid JSON formatting and tool extraction tool.", options);
}

export async function generateTextFromFiles(env: Env, prompt: string, files: FileInput[], systemPrompt?: string, options?: AIOptions): Promise<string> {
  const fileContext = files.map(f => `--- ${f.name} ---\n${f.isBase64 ? Buffer.from(f.data, 'base64').toString('utf-8') : f.data}`).join("\n\n");
  const finalPrompt = `Files Context:\n${fileContext}\n\nUser Request: ${prompt}`;
  return generateText(env, finalPrompt, systemPrompt, options);
}

export async function generateStructuredResponseFromFiles<T>(env: Env, prompt: string, files: FileInput[], schema: z.ZodType<T>, systemPrompt?: string, options?: AIOptions): Promise<T> {
  const fileContext = files.map(f => `--- ${f.name} ---\n${f.isBase64 ? Buffer.from(f.data, 'base64').toString('utf-8') : f.data}`).join("\n\n");
  const finalPrompt = `Files Context:\n${fileContext}\n\nUser Request: ${prompt}`;
  return generateStructuredResponse(env, finalPrompt, schema, systemPrompt, options);
}

// Advanced orchestration specifically available via Jules

export async function analyzeRepo(env: Env, repoUrl: string, prompt: string): Promise<string> {
  await initJules();
  const julesSession = await jules.session({ prompt: `Analyze the repository at ${repoUrl}. ${prompt}` });
  let julesOutput = "";
  for await (const activity of julesSession.stream()) {
    if (activity.type === 'agentMessaged') julesOutput += activity.message + "\n";
  }
  return julesOutput.trim();
}

export async function completeTask(env: Env, repoUrl: string, issueId: string): Promise<string> {
  await initJules();
  const julesSession = await jules.session({ prompt: `Complete the task associated with issue ID ${issueId} in the repository ${repoUrl}.` });
  let julesOutput = "";
  for await (const activity of julesSession.stream()) {
    if (activity.type === 'agentMessaged') julesOutput += activity.message + "\n";
  }
  return julesOutput.trim();
}

export async function createPlan(env: Env, prompt: string, githubRepoUrl?: string): Promise<string> {
  await initJules();

  const db = getDb(env.DB);
  const planningRequestId = crypto.randomUUID();

  // Extract owner and name if URL provided
  let githubRepoOwner = null;
  let githubRepoName = null;
  if (githubRepoUrl) {
    const parts = githubRepoUrl.split('/');
    if (parts.length >= 2) {
      githubRepoName = parts.pop() || null;
      githubRepoOwner = parts.pop() || null;
    }
  }

  // 1. Initialize record
  await db.insert(planningRequests).values({
    id: planningRequestId,
    timestamp: new Date().toISOString(),
    githubRepoOwner,
    githubRepoName,
    originalPrompt: prompt,
    upscaledPrompt: null
  });

  // 2. Research Topic Extraction
  const topicExtractionSchema = z.object({
    topics: z.array(z.string()).max(3).describe("1 to 3 critical research topics or technical concepts to clarify that would enhance this planning prompt.")
  });

  const extractionPrompt = `Review this planning prompt and identify critical research topics:\n\n${prompt}`;
  let topics: string[] = [];
  try {
    const extracted = await indexGenerateStructured<{ topics: string[] }>(env, extractionPrompt, topicExtractionSchema, "You are a senior engineering manager.", { model: "gemini-2.5-flash" }, "gemini");
    topics = extracted.topics;
  } catch (e) {
    console.error("Failed to extract topics", e);
  }

  // 3. Execution of Research Tasks
  let researchDetails = "";
  if (topics.length > 0) {
    for (const topic of topics) {
      const researchTaskId = crypto.randomUUID();
      let details = "";
      try {
        if (topic.toLowerCase().includes("cloudflare")) {
           details = await rewriteQuestionForMCP(env, `Provide details on: ${topic}`, { tags: ['cloudflare'] });
           const jSession = await jules.session({ prompt: `Research this topic comprehensively: ${details}` });
           for await (const activity of jSession.stream()) {
             if (activity.type === 'agentMessaged') details += activity.message + "\n";
           }
        } else {
           const jSession = await jules.session({ prompt: `Research this technical topic comprehensively: ${topic}` });
           for await (const activity of jSession.stream()) {
             if (activity.type === 'agentMessaged') details += activity.message + "\n";
           }
        }
      } catch (e) {
        details = `Failed to research topic: ${e}`;
      }

      await db.insert(planningRequestsUpscaling).values({
        id: researchTaskId,
        planningRequestId,
        task: 'technical_research',
        details: `Topic: ${topic}\nFindings:\n${details.trim()}`
      });
      researchDetails += `Topic: ${topic}\nFindings:\n${details.trim()}\n\n`;
    }
  }

  // Repo Analysis Loop
  if (githubRepoUrl) {
    const analysisTaskId = crypto.randomUUID();
    let repoAnalysis = "";
    try {
      const jSession = await jules.session({ prompt: `Analyze the repository at ${githubRepoUrl}. Summarize the architecture, tech stack, and structure to inform a new feature plan.` });
      for await (const activity of jSession.stream()) {
        if (activity.type === 'agentMessaged') repoAnalysis += activity.message + "\n";
      }
    } catch(e) {
      repoAnalysis = `Failed to analyze repo: ${e}`;
    }
    
    await db.insert(planningRequestsUpscaling).values({
        id: analysisTaskId,
        planningRequestId,
        task: 'github_repo_analysis',
        details: repoAnalysis.trim()
    });
    researchDetails += `Repo Analysis (${githubRepoUrl}):\n${repoAnalysis.trim()}\n\n`;
  }

  // 4. Prompt Upscaling
  let upscaledPromptResult = prompt;
  if (researchDetails.length > 0) {
    const upscalePromptText = `You are a senior staff engineer. Review the original prompt and the accumulated research to produce a highly-defined, expert planning prompt.\n\nOriginal Prompt:\n${prompt}\n\nResearch Findings:\n${researchDetails}\n\nOutput ONLY the optimized prompt.`;
    try {
      upscaledPromptResult = await generateText(env, upscalePromptText, "You are an expert prompt engineer.");
    } catch (e) {
      console.error("Failed to upscale prompt", e);
    }
    
    await db.update(planningRequests)
      .set({ upscaledPrompt: upscaledPromptResult })
      .where(eq(planningRequests.id, planningRequestId));
  }

  // 5. Final Plan Generation
  const finalSession = await jules.session({ prompt: `Create a detailed coding plan for the following task:\n\n${upscaledPromptResult}` });
  let julesOutput = "";
  for await (const activity of finalSession.stream()) {
    if (activity.type === 'agentMessaged') julesOutput += activity.message + "\n";
  }
  julesOutput = julesOutput.trim();

  const planResponseId = crypto.randomUUID();
  await db.insert(planResponses).values({
    id: planResponseId,
    planningRequestId,
    prompt: upscaledPromptResult,
    response: julesOutput
  });

  // 6. Task / Project Ingestion
  try {
     await persistDerivedPlansFromMarkdown(env, {
       requestId: planningRequestId,
       workstream: "project_planning",
       markdown: julesOutput,
       projectName: `Plan for ${githubRepoName || "Task"}`
     });
  } catch (e) {
     console.error("Failed to ingest plan breakdown", e);
  }

  return julesOutput;
}
