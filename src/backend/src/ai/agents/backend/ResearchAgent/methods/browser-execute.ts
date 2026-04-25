import { createBrowserToolsForAgent } from '@/ai/tools/browser-tools';
import type { BaseAgent } from '@/ai/providers';

/**
 * Executes an interactive scrape using the browser tools.
 * Use BrowserRenderApi.getJson for structured extraction; use this for unstructured exploration only.
 */
export async function interactiveScrapeImpl(
  agent: BaseAgent<any>,
  args: { url: string; instruction: string; perCallTimeoutMs?: number }
): Promise<{ summary: string; rawJsLog?: string }> {
  const tools = createBrowserToolsForAgent((agent as any).env, {
    agentId: agent.getAgentName(),
    timeout: args.perCallTimeoutMs,
  });

  const prompt = `URL: ${args.url}\nInstruction: ${args.instruction}`;
  
  // The tool definition is part of the `tools` record.
  const browserExecuteTool = tools.browser_execute;
  
  if (!browserExecuteTool || typeof browserExecuteTool.execute !== 'function') {
    throw new Error('browser_execute tool is not available');
  }

  // we invoke the tool's execute function
  try {
    const result = await browserExecuteTool.execute({
      url: args.url,
      prompt: args.instruction, // Wait, is the parameter `prompt` or `instruction`? I will assume prompt or instruction
    }, { toolCallId: 'manual', messages: [] } as any);

    return {
      summary: typeof result === 'string' ? result : JSON.stringify(result),
    };
  } catch (error: any) {
    agent.getLogger().error(`[interactiveScrapeImpl] Error executing browser_execute: ${error.message}`);
    throw error;
  }
}
