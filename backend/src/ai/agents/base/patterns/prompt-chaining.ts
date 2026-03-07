/**
 * AI Pattern: Prompt Chaining
 * 
 * Implements a sequential pipeline where the output of 
 * one model step becomes the input (or part of the prompt) 
 * for the next step.
 * 
 * @module AI/Agents/Base/Patterns/PromptChaining
 */
import { BaseAgent } from "@/ai/agents/base/BaseAgent";
import { getAgentModel } from "@/ai/providers/config";
import { getMessageContent } from '@/ai/agents/base/agent-utils';

export type PromptChainingStep = Record<string, never>;

/**
 * Abstract class implementation of the Prompt Chaining pattern.
 */
export abstract class PromptChainingAgent extends BaseAgent {
  protected maxTurns = 3;

  /**
   * Implement this to check quality.
   * Return a JSON object with metrics and a boolean 'passes' flag (or inferred from metrics).
   */
  protected abstract checkQuality(content: string): Promise<{ passes: boolean; feedback: string[] }>;

  /**
   * Main execution flow.
   */
  async execute(input: string, instructions?: string) {
    const model = getAgentModel('default', this.env);
    const systemPrompt = instructions || "You are a helpful assistant.";
    
    // 1. Generate
    let content = await this.runTextWithModel({
      name: "PromptChainingAgent",
      instructions: systemPrompt,
      prompt: input,
      model,
    });

    // 2. Evaluate
    let quality = await this.checkQuality(content);

    // 3. Conditional Regenerate
    let turns = 0;
    while (!quality.passes && turns < this.maxTurns) {
      console.log(`Quality check failed: ${quality.feedback.join('\n')}. Regenerating...`);
      
      content = await this.runTextWithModel({
        name: "PromptChainingAgent",
        instructions: systemPrompt,
        model,
        prompt: `
        Original Request: ${input}
        Previous Attempt: ${content}
        Critique: ${quality.feedback.join('\n')}
        Improve the response based on the critique.
      `
      });
      
      quality = await this.checkQuality(content);
      turns++;
    }

    return { content, quality };
  }
}
