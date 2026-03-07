
import { BaseAgent } from "./base/BaseAgent";
import { callable } from "agents";
import { z } from "zod";

// Schema for refinement output - stricter than `any` to ensure quality
const LandingPageRefinementSchema = z.object({
    purpose: z.object({
        headline: z.string().optional(),
        tagline: z.string().optional(),
        valueStatement: z.string().optional(),
    }).optional(),
    branding: z.any().optional(), // Can be object with color properties
    painPoints: z.array(z.object({
        title: z.string(),
        description: z.string(),
        solution: z.string(),
    })).optional(),
    metrics: z.array(z.object({
        value: z.string(),
        label: z.string(),
        trend: z.enum(["positive", "neutral", "negative"]).optional(),
    })).optional(),
}).passthrough();

export type LandingPageRefinementResponse = z.infer<typeof LandingPageRefinementSchema>;

type RefinementInput = {
    currentConfig: any;
    prompt: string;
    preferredProvider?: string | null;
    preferredModel?: string | null;
};

export class LandingPageAgent extends BaseAgent<any> {
  @callable()
  async refineConfig(input: RefinementInput): Promise<any> {
    const currentCustom = JSON.stringify(input.currentConfig || {});
    
    // Construct the prompt for the AI
    const userPrompt = [
      `Current Custom Config: ${currentCustom}`,
      `User Prompt: "${input.prompt}"`,
      "",
      "Generate the JSON update.",
    ].join("\n");

    // Use the BaseAgent's helper to run the model natively with schema
    const parsedObj = await this.runStructuredResponseWithModel({
        name: "LandingPageRefinementAgent",
        instructions: [
            "You are a Landing Page Refinement Agent.",
            "Your goal is to update the landing page configuration based on user feedback.",
            "Output ONLY a JSON object representing the *changes* or *new state* for 'customAnalysis'.",
            "Focus on: 'purpose' (headline, tagline), 'branding' (colors), 'painPoints', 'metrics'.",
            "Maintain existing structure where possible unless asked to change.",
        ].join(" "),
        prompt: userPrompt,
        schema: LandingPageRefinementSchema,
        provider: input.preferredProvider,
        model: input.preferredModel
    });

    // Parse output safely
    return LandingPageRefinementSchema.parse(parsedObj);
  }
}
