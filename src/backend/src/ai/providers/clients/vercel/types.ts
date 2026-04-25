import type { AIOptions } from "@/ai/providers/types";

export interface VercelOptions extends AIOptions {
  /**
   * Vercel AI SDK specific options to override/extend defaults
   */
  maxSteps?: number;
  /**
   * Pre-resolved skill context to bypass dynamic fetch (Jules Two-Step)
   */
  skillContext?: string;
}
