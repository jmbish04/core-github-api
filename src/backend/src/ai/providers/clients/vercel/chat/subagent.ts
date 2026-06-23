import type { AIProvider } from "@/ai/providers";

/**
 * Subagent Delegation using official Cloudflare Agents SDK RPC
 */
export async function delegateToSubagentImpl(
  provider: AIProvider,
  subagentName: string,
  prompt: string,
  context?: any
): Promise<any> {
    const { getAgentByName } = await import('agents');
    
    // Resolve target namespace from environment
    const NS_KEY = subagentName.toUpperCase();
    const TARGET_NAMESPACE = (provider.env as any)[NS_KEY];
    
    if (!TARGET_NAMESPACE) {
       throw new Error(`Subagent namespace ${NS_KEY} not found in env bindings.`);
    }

    // Get the stub (RPC interface)
    const stub = await getAgentByName(TARGET_NAMESPACE, subagentName);
    
    /**
     * Internal RPC: We explicitly call the '@callable chat' method.
     * This bypasses the WebSocket/HTTP overhead for agent-to-agent talk.
     */
    try {
        return await (stub as any).chat(prompt, context);
    } catch (error: any) {
        // Handle cases where the agent might not have 'chat' yet or it's incorrectly typed
        provider.logger.error(`Failed to delegate to subagent ${subagentName}: ${error.message}`);
        throw error;
    }
}
