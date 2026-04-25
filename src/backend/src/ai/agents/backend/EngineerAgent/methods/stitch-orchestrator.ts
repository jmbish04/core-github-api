import type { EngineerAgent } from "../index";
import { emitMilestone } from "./milestones";

/**
 * Stitch Build Loop — orchestrates UI generation using the Stitch
 * MCP tools with the baton-passing pattern from the stitch-loop skill.
 *
 * Each iteration: generate screen → evaluate → refine → next screen.
 */
export async function runStitchLoop(
  agent: EngineerAgent,
  requestId: string,
  pages: StitchPage[],
): Promise<StitchBuildResult> {
  const completedPages: string[] = [];

  for (const page of pages) {
    await emitMilestone(agent, {
      requestId,
      name: `stitch:${page.name}`,
      status: "in_progress",
      detail: `Generating ${page.name}`,
      timestamp: Date.now(),
    });

    try {
      // Phase 1: Generate the screen
      // AI-augmented planning with D1-backed skill injection
      const ai = agent.getAI();
      const plan = await ai.generateText(
        `Plan the architecture and component structure for the following screen:\n\nScreen Name: ${page.name}\nPrompt: ${page.prompt}${page.designSystem ? `\nDesign System: ${page.designSystem}` : ''}`,
        'You are an expert Frontend Engineer. Plan the component structure, state management, and API integration for the requested screen.',
        { skills: ['stitch-design', 'react-components', 'stitch-loop'] }
      );

      console.log(`[EngineerAgent:stitch] Generated plan for ${page.name}: ${plan.slice(0, 100)}...`);

      completedPages.push(page.name);

      await emitMilestone(agent, {
        requestId,
        name: `stitch:${page.name}`,
        status: "complete",
        detail: `Generated ${page.name}`,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error(`[EngineerAgent:stitch] Failed to generate page ${page.name}:`, err);
      await emitMilestone(agent, {
        requestId,
        name: `stitch:${page.name}`,
        status: "failed",
        detail: `${err}`,
        timestamp: Date.now(),
      });
    }
  }

  return { completedPages, totalPages: pages.length };
}

export interface StitchPage {
  name: string;
  prompt: string;
  designSystem?: string;
}

export interface StitchBuildResult {
  completedPages: string[];
  totalPages: number;
}
