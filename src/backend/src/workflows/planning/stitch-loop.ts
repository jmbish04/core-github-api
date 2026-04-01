/**
 * @file backend/src/workflows/planning/stitch-loop.ts
 * @description Autonomous Stitch-Loop Orchestrator — a durable Cloudflare Workflow
 * that chains UX prompt enhancement → Stitch screen generation → Jules implementation.
 *
 * This replaces local Python scripts by running the entire design-to-code pipeline
 * natively on the Cloudflare Worker with built-in retries and durability.
 *
 * @module Workflows/Planning/StitchLoop
 */

import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
import { StitchService } from "@services/stitch";
import { JulesService } from "@services/jules/service";
import type { StitchLoopParams } from "@services/stitch";

const DESIGN_SYSTEM_RULES = `
**DESIGN SYSTEM (REQUIRED):**
- Theme: Default Dark Shadcn (Zinc). Obsidian surfaces.
- Background: bg-zinc-950 for canvas, bg-zinc-900 for cards.
- NO BORDERS: Use surface tonal shifts only. No 1px border lines. Use ring-1 ring-zinc-800 for subtle separation.
- Typography: Use zinc-50 for headings, zinc-400 for body text.
- Accent: Amber/orange for warnings, emerald for success, red for errors.
- Charts (Recharts): Monochromatic Zinc scale. All axis labels and tooltips MUST use fill="#fafafa" for high contrast.
- Components: Use Shadcn Base UI components. All cards use border-none.
- Output: Single isolated React JSX file with TypeScript. No tabbed monoliths.
- Imports: React, Recharts, Shadcn/ui components only. No external dependencies.
`;

export class StitchLoopWorkflow extends WorkflowEntrypoint<
  Env,
  StitchLoopParams
> {
  async run(
    event: WorkflowEvent<StitchLoopParams>,
    step: WorkflowStep
  ): Promise<{
    stitchScreenId?: string;
    julesSessionId?: string;
    status: string;
  }> {
    const {
      prompt,
      repoOwner,
      repoName,
      branch = "main",
      routeType = "global",
      pageId,
      stitchProjectId,
      structure,
    } = event.payload;

    // ── Step 1: Enhance Prompt ─────────────────────────────────────────────
    const enhancedPrompt = await step.do(
      "enhance-prompt",
      {
        retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
        timeout: "60 seconds",
      },
      async () => {
        const structureBlock = structure?.length
          ? `\n**PAGE STRUCTURE:**\n${structure.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
          : "";

        const systemPrompt = `You are a senior UX architect. Enhance the following UI brief into a detailed, implementation-ready UX specification. Inject the design system rules exactly as provided. Output ONLY the enhanced prompt text, no preamble.`;

        const userPrompt = `${prompt}\n${DESIGN_SYSTEM_RULES}${structureBlock}\n\n**TECHNICAL CONSTRAINTS:**\n- Single isolated React JSX file targeting: ${routeType === "global" ? "src/frontend/src/views/control/global" : "src/frontend/src/views/repos"}/${pageId}.tsx\n- Must use Unified Error Boundary and Shadcn components.\n- Must be fully self-contained with no external state dependencies.`;

        const response = await this.env.AI.run(
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any,
          {
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }
        );

        return (response as any).response || userPrompt;
      }
    );

    // ── Step 2: Generate UX via Stitch ─────────────────────────────────────
    const stitchResult = await step.do(
      "generate-ux",
      {
        retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
        timeout: "120 seconds",
      },
      async () => {
        const stitch = StitchService.getInstance(this.env);
        const projectId =
          stitchProjectId || "sentinel-engine-2026";

        const result = await stitch.generateScreen({
          projectId,
          prompt: enhancedPrompt,
          deviceType: "DESKTOP",
        });

        if (!result.html && !result.htmlCode) {
          throw new Error(
            `[StitchLoop] Stitch returned no HTML: ${JSON.stringify(result)}`
          );
        }

        return result;
      }
    );

    // ── Step 3: Hand off to Jules for Implementation ───────────────────────
    const julesSessionId = await step.do(
      "jules-implementation",
      {
        retries: { limit: 1, delay: "15 seconds" },
        timeout: "180 seconds",
      },
      async () => {
        const targetDir =
          routeType === "global"
            ? "src/frontend/src/views/control/global"
            : "src/frontend/src/views/repos";

        const htmlPayload = stitchResult.html || stitchResult.htmlCode || "";

        const julesPrompt = `Convert the following Stitch-generated UX design into a production React component.

**TARGET FILE:** ${targetDir}/${pageId}.tsx

**REQUIREMENTS:**
- Use TypeScript with proper type annotations
- Use Shadcn/ui components (Card, Button, Badge, etc.)
- Use Recharts for any chart/graph elements
- Follow the Brutalist Sanctuary design: bg-zinc-950 canvas, bg-zinc-900 cards, NO borders
- Ensure all Recharts labels use fill="#fafafa"
- Import from @/components/ui/ for Shadcn components
- Use the project's existing error boundary pattern
- Single file, fully self-contained

**STITCH HTML DESIGN:**
\`\`\`html
${htmlPayload}
\`\`\`

Convert this HTML into the equivalent React TSX component. Maintain the exact visual design, layout, and data display patterns. Replace HTML elements with appropriate Shadcn components.`;

        const jules = JulesService.getInstance(this.env);
        const session = await jules.startSession({
          prompt: julesPrompt,
          repo: {
            owner: repoOwner,
            repo: repoName,
            branch,
          },
          autoPr: true,
          specialistClass: "StitchLoopWorkflow",
          projectId: "sentinel-engine",
        });

        return session.id || crypto.randomUUID();
      }
    );

    return {
      stitchScreenId: stitchResult.screenId,
      julesSessionId,
      status: "completed",
    };
  }
}
