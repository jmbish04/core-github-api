/**
 * Safely normalizes AI model IDs to ensure canonical provider prefixes.
 * Replicates the Python `_format_model_id` Universal Routing logic.
 */
export function formatModelId(modelId: string): string {
  if (!modelId) {
    return modelId;
  }

  const lowerId = modelId.toLowerCase();

  // Step 1: Evaluate explicit provider prefixes using split by first slash
  if (modelId.includes('/')) {
    const firstSlashIdx = modelId.indexOf('/');
    const prefix = modelId.substring(0, firstSlashIdx).toLowerCase();
    const remainder = modelId.substring(firstSlashIdx + 1);

    // Cloudflare Workers AI
    if (prefix === '@cf') {
      return `workers-ai/@cf/${remainder}`;
    } else if (prefix === 'workers-ai') {
      return `workers-ai/${remainder}`;
    }
    // Google AI Studio
    else if (prefix === 'gemini' || prefix === 'google-ai-studio') {
      return `google-ai-studio/${remainder}`;
    }
    // OpenAI
    else if (prefix === 'gpt' || prefix === 'openai') {
      return `openai/${remainder}`;
    }
    // Anthropic
    else if (prefix === 'claude' || prefix === 'anthropic') {
      return `anthropic/${remainder}`;
    }
  }

  // Step 2: Fallback keyword matching for unprefixed models
  if (lowerId.includes('gpt') || lowerId.includes('o1') || lowerId.includes('o3')) {
    return `openai/${modelId}`;
  } else if (lowerId.includes('claude')) {
    return `anthropic/${modelId}`;
  } else if (lowerId.includes('gemini')) {
    return `google-ai-studio/${modelId}`;
  }

  // Fallback: return as-is if no matching routing rules apply
  return modelId;
}
