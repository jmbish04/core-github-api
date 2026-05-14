import { createGatedCodemodeTool } from '@/ai/tools/codemode-tool';
import type { BaseThinkAgent } from '@/ai/providers/agent-support';

/**
 * Executes a strictly read-only codemode orchestration pass.
 * @beta Experimental feature. Refer to docs/new_agents_sdk/codemode.md.
 * Note: Codemode has severe footgun risks if mutated. This only mounts safe tools.
 */
export async function experimentalCodemodeOrchestrateImpl(
  agent: BaseThinkAgent<any>,
  args: any
): Promise<{ status: string; reason?: string; result?: any }> {
  const env = (agent as any).env;
  if (env.CODEMODE_ENABLED !== '1') {
    return { status: 'disabled', reason: 'CODEMODE_ENABLED flag is off' };
  }

  try {
    const codemodeTool = createGatedCodemodeTool({
      env,
      tools: {} // Mount empty safe tools for now until a registry is defined
    });

    const prompt = args?.prompt || args?.task || JSON.stringify(args);
    const systemPrompt = "You are a code orchestration agent. Use the codemode tool to write code that completes the requested task.";

    const response = await (agent as any).ai.generateTextWithTools(
      prompt,
      [codemodeTool],
      systemPrompt
    );

    return { status: 'success', result: response };
  } catch (error: any) {
    (agent as any).logger.error(`[experimentalCodemodeOrchestrateImpl] Error: ${error.message}`);
    return { status: 'error', reason: error.message };
  }
}
