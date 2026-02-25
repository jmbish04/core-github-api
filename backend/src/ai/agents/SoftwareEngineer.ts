import type { Agent } from "@openai/agents";
import { z } from "zod";
import {
  createRunner,
  resolveDefaultAiModel,
  resolveDefaultAiProvider,
} from "@/ai/agent-ai";
import { buildGoldenPathInstructions } from "@/standards/goldenPath";

const CodeGeneratorResponseSchema = z.object({
  reply: z.string(),
  implementationSteps: z.array(z.string()).default([]),
  suggestedFiles: z.array(z.string()).default([]),
  taskForJules: z.string().optional(),
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

export class CodeGeneratorAgent {
  constructor(private readonly env: Env) {}

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

