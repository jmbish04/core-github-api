/**
 * Software engineer planning service.
 *
 * This is not a Durable Object agent. It is an env-bound helper used to
 * synthesize implementation plans through the shared provider layer.
 */
import { z } from "zod";
import {
  resolveDefaultAiModel,
  resolveDefaultAiProvider,
} from "@/ai/agents/support/agent-ai";
import { buildCodingAgentInstructions } from "@/services/golden-path-config";
import { AIGateway } from "@/ai/utils/ai-gateway";

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
 * The CodeGenerationService prepares technical roadmaps and scaffolded code.
 */
export class CodeGenerationService {
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
      
    const instructions = [
        "You are a senior implementation planner that prepares coding tasks and patch-ready plans.",
        "When asked to scaffold or generate architecture, enforce the Cloudflare Worker Golden Path.",
        await buildCodingAgentInstructions(this.env, { customInstructions: input.customInstructions }),
        "Keep reply concise and actionable.",
    ].join(" ");

    const aiInput = [
      `Project: ${input.projectName}`,
      `Repository: ${input.repoFullName}`,
      "",
      `User prompt: ${input.prompt}`,
    ].join("\n");

    const result = await AIGateway.runStructuredResponseWithModelFallback(
        this.env,
        provider,
        model,
        instructions,
        aiInput
    );
    
    return CodeGeneratorResponseSchema.parse(result || { reply: result?.reply || "" });
  }
}
