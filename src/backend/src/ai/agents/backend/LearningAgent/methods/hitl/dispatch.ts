import { Logger } from "@/lib/logger";
import type { LearningAgent } from "@/ai/agents/backend/LearningAgent";

export async function dispatchEngineerSprint(
  agent: LearningAgent,
  repoFullName: string,
  prompt: string,
  approvalId: string
): Promise<string> {
  const logger = new Logger((agent as any).env, "LearningAgent");

  
  const enrichedPrompt = `
## CI Healer Continuous Learning — Approved Fix (Approval ID: ${approvalId})

**Repository**: ${repoFullName}

${prompt}

---
**Instructions for Jules:**
1. First, generate a detailed Implementation Plan artifact.
2. Wait for review (this prompt has already been reviewed by a human).
3. Implement the code change following the plan.
4. Submit a PR with a descriptive title prefixed with \`[CI Healer]\`.
`.trim();

  const engineerAgent = (agent as any).getPeerAgent((agent as any).env.ENGINEER_AGENT);
  const sprintId = `learn-${approvalId}-${Date.now()}`;
  
  const sprint = {
    id: sprintId,
    requestId: approvalId,
    title: `Apply CI Healer Fix to ${repoFullName}`,
    subtasks: [
      {
        id: `sub-${Date.now()}`,
        description: enrichedPrompt,
        role: 'swe' as any,
        status: 'pending' as any
      }
    ]
  };

  await engineerAgent.assignSprint(sprint);
  
  logger.info(`EngineerAgent Sprint created for approval ${approvalId}: ${sprint.id}`);
  return sprint.id;
}
