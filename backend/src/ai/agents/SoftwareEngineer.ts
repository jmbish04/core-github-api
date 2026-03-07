/**
 * Software Engineer Agent (Code Generation & Scaffolding)
 * 
 * Specialized agent responsible for generating implementation plans, 
 * architectural scaffolds, and patch-ready code updates.
 * Follows the "Cloudflare Worker Golden Path" for development standards.
 * 
 * @module AI/Agents/SoftwareEngineer
 */
import type { Agent } from "@openai/agents";
import { z } from "zod";
import {
  createRunner,
  resolveDefaultAiModel,
  resolveDefaultAiProvider,
} from "@/ai/agents/base/agent-ai";
import { buildGoldenPathInstructions } from "@/config/goldenPath";

const CodeGeneratorResponseSchema = z.object({
  reply: z.string(),
  implementationSteps: z.array(z.string()).default([]),
  suggestedFiles: z.array(z.string()).default([]),
  taskForJules: z.string().optional(),
  plan: z.object({
    epics: z.array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        userStories: z.array(
          z.object({
            title: z.string(),
            description: z.string().optional(),
            tasks: z.array(z.string()).default([]),
          })
        ).default([]),
      })
    ).default([]),
  }).optional().describe("Include ONLY if the user explicitly asks for an implementation plan or roadmap."),
});

export type CodeGeneratorResponse = z.infer<typeof CodeGeneratorResponseSchema>;

type CodeGeneratorInput = {
  projectName: string;
  repoFullName: string;
  prompt: string;
  customInstructions?: string | null;
  preferredProvider?: string | null;
  preferredModel?: string | null;
};

/**
 * The CodeGeneratorAgent prepares technical roadmaps and scaffolded code.
 */
export class CodeGeneratorAgent {
  constructor(private readonly env: Env) {}

/**
 * Orchestrates a code generation run.
 * 
 * @param input - Contextual engineering metadata and the user prompt.
 * @returns A structured implementation plan and response.
 */
  async run(input: CodeGeneratorInput): Promise<CodeGeneratorResponse> {
    const provider = (input.preferredProvider?.trim() ||
      resolveDefaultAiProvider(this.env)) as any;
    const model =
      input.preferredModel?.trim() ||
      resolveDefaultAiModel(this.env, provider);
    const runner = await createRunner(this.env, provider, model);

    const { Agent: OpenAIAgent } = await import("@openai/agents");
    const agent = new OpenAIAgent({
      name: "CodeGeneratorAgent",
      model,
      outputType: CodeGeneratorResponseSchema,
      instructions: [
        "You are a senior implementation planner that prepares coding tasks and patch-ready plans.",
        "When asked to scaffold or generate architecture, enforce the Cloudflare Worker Golden Path.",
        buildGoldenPathInstructions(input.customInstructions),
        "Keep reply concise and actionable.",
      ].join(" "),
    });

    const aiInput = [
      `Project: ${input.projectName}`,
      `Repository: ${input.repoFullName}`,
      "",
      `User prompt: ${input.prompt}`,
    ].join("\n");

    const result = await runner.run(agent, aiInput);
    return CodeGeneratorResponseSchema.parse(result.finalOutput || { reply: "" });
  }
}

