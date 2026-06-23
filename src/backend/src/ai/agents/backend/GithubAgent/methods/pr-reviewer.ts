/**
 * @file GithubAgent/methods/pr-reviewer.ts
 * @description Absorbed from PrReviewer.ts — Jules-orchestrated PR review workflow.
 *              Pure function receiving AIProvider + JulesClient via DI.
 */

import type { AIProvider } from '@/ai/providers';
import { getJulesClient } from '@/ai/providers';
import type { PrReviewTask } from '../types';

export interface PrReviewResult {
  status: string | undefined;
  commentsCount: number;
  summary: string;
}

/**
 * Runs an autonomous Jules PR review session.
 * Creates a Jules session, auto-approves plans, and provides AI-generated
 * guidance when Jules asks questions.
 */
export async function reviewPr(
  ai: AIProvider,
  env: Env,
  task: PrReviewTask,
): Promise<PrReviewResult> {
  const julesClient = await getJulesClient(env as any);
  const overseerPrompt =
    'You are a Senior Architect overseeing a code review agent. Provide direct guidance to ensure high-quality, bug-free code.';

  console.log(`[GithubAgent:pr-reviewer] Orchestrating review for ${task.owner}/${task.repo}#${task.pullNumber}`);

  const session = await julesClient.session({
    title: `PR Review: ${task.owner}/${task.repo}#${task.pullNumber}`,
    prompt: `Review pull request #${task.pullNumber} in ${task.owner}/${task.repo}. 
             Analyze the diff, find bugs or optimizations, and create line-specific review comments. 
             Submit a final summary review when finished.`,
    source: {
      github: `${task.owner}/${task.repo}`,
      baseBranch: task.branch,
    },
    requireApproval: false,
    autoPr: false,
  });

  // Autonomous oversight loop
  let isTerminal = false;
  let finalOutcome: any | null = null;
  let lastProcessedActivityId: string | null = null;

  while (!isTerminal) {
    const info = await session.info();
    const state = info.state;

    if (state === 'completed' || state === 'failed') {
      finalOutcome = info.outcome!;
      isTerminal = true;
      break;
    }

    if (state === 'awaitingPlanApproval') {
      console.log(`[GithubAgent:pr-reviewer] Auto-approving review plan for ${session.id}`);
      await session.approve();
    }

    const activities = await session.activities.select({ limit: 1 });
    const lastActivity = activities[0];

    if (
      lastActivity &&
      lastActivity.id !== lastProcessedActivityId &&
      lastActivity.type === 'agentMessaged' &&
      lastActivity.originator === 'agent'
    ) {
      console.log(`[GithubAgent:pr-reviewer] Providing guidance for message: ${lastActivity.message}`);

      const guidanceResult = await ai.chat.generateText(
        [{ role: 'user', content: `Review context: ${task.title}. Agent asks: ${lastActivity.message}` }],
        overseerPrompt,
        { provider: 'workers-ai', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
      );
      const reply = guidanceResult || 'Proceed with standard best practices.';
      await session.send(reply);
      lastProcessedActivityId = lastActivity.id;
    }

    // 10s backpressure between polls
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  return {
    status: finalOutcome?.state,
    commentsCount: finalOutcome?.summary?.length || 0,
    summary: 'PR Review completed via autonomous Jules orchestration.',
  };
}
