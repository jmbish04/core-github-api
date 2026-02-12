/**
 * AI Configuration Module
 * * Centralizes model selection and AI Gateway URL construction for the Forensic Worker.
 * All agents must retrieve their model configuration and gateway routing from here
 * to ensure consistency across the orchestration layer.
 */

// NOTE: Env is globally available from worker-configuration.d.ts — DO NOT define locally

/**
 * Valid SDK use cases for determining the correct Gateway endpoint format.
 */
export type GatewayUseCase = 
  | 'openai_agents_sdk' 
  | 'openai_sdk' 
  | 'worker_ai' 
  | 'google_sdk' 
  | 'anthropic_sdk';

/**
 * Retrieves the configured model slug for a given agent or module.
 * * @param moduleName - The name of the module or specific agent identifier.
 * @returns The partial model slug (e.g., '@cf/openai/gpt-oss-120b').
 */
export const getAgentModel = (moduleName: string, env?: Env): string => {
  // Default to TRUE if env is missing or varies, to maintain stability unless explicitly disabled
  const useOpenAI = (env?.USE_OPENAI_MODELS as boolean | undefined) !== false; 

  if (useOpenAI) {
    const models: Record<string, string> = {
      // --- Global Agents ---
      'global-judge': 'openai/gpt-4o-mini',
      'warehouse': 'openai/gpt-4o-mini',
      'document-processor': 'openai/gpt-4o-mini',
      'finance': 'openai/gpt-4o-mini',
      'finance-orchestrator': 'openai/gpt-4o-mini',
      'invoice-auditor': 'openai/gpt-4o-mini',
      'finance-critic': 'openai/gpt-4o-mini',
      'legal': 'openai/gpt-4o-mini',
      'legal-orchestrator': 'openai/gpt-4o-mini',
      'warranty-analyst': 'openai/gpt-4o-mini',
      'compliance': 'openai/gpt-4o-mini',
      'compliance-orchestrator': 'openai/gpt-4o-mini',
      'license-investigator': 'openai/gpt-4o-mini',
      'timeline': 'openai/gpt-4o-mini',
      'timeline-extractor': 'openai/gpt-4o-mini',
      'timeline-evaluator': 'openai/gpt-4o-mini',
      'remedy': 'openai/gpt-4o-mini',
      'remedy-rewriter': 'openai/gpt-4o-mini',
      'recall-helper': 'openai/gpt-4o-mini',
      'default': 'openai/gpt-4o-mini',
      'fallback': 'openai/gpt-4o-mini',
    };
    return models[moduleName] || models['default'];
  } else {
    // Workers AI Models (gpt-oss-120b & llama-3.3)
    const models: Record<string, string> = {
      // Complex Orchestrators & Judges -> GPT-OSS-120b
      'global-judge': '@cf/openai/gpt-oss-120b',
      'finance-orchestrator': '@cf/openai/gpt-oss-120b',
      'legal-orchestrator': '@cf/openai/gpt-oss-120b',
      'compliance-orchestrator': '@cf/openai/gpt-oss-120b',
      'remedy': '@cf/openai/gpt-oss-120b',
      'document-processor': '@cf/openai/gpt-oss-120b',

      // General Agents -> Llama 3.3
      'warehouse': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'finance': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'invoice-auditor': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'finance-critic': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'legal': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'warranty-analyst': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'compliance': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'license-investigator': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'timeline': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'timeline-extractor': '@cf/openai/gpt-oss-120b', // Extraction needs structured adherence
      'timeline-evaluator': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'remedy-rewriter': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'recall-helper': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      
      'default': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'fallback': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    };
    return models[moduleName] || models['default'];
  }
};

/**
 * Resolves the AI Gateway provider slug from a model name.
 * * @param modelSlug - The model slug (e.g., '@cf/openai/gpt-oss-120b', 'openai/gpt-4').
 * @returns The gateway provider string (e.g., 'workers-ai', 'openai').
 */
export function resolveProvider(modelSlug: string): string {
  if (modelSlug.startsWith('@cf/')) return 'workers-ai';
  if (modelSlug.startsWith('openai/')) return 'openai';
  if (modelSlug.startsWith('google/') || modelSlug.startsWith('gemini')) return 'google-ai-studio';
  if (modelSlug.startsWith('anthropic/') || modelSlug.startsWith('claude')) return 'anthropic';
  if (modelSlug.startsWith('openrouter/')) return 'openrouter';
  return 'workers-ai'; // Default fallback
}

/**
 * Constructs the AI Gateway Base URL for a given provider.
 * Returns the provider-specific gateway endpoint.
 * * @param env - The Worker environment bindings.
 * @param fullModelName - The model name (used to differentiate native vs. compat routing).
 * @param useCase - The SDK context (default: 'openai_agents_sdk').
 * @returns The gateway URL for the provider.
 */
export async function getAiGatewayBaseUrl(
  env: Env,
  fullModelName: string,
  useCase: GatewayUseCase = 'openai_agents_sdk'
): Promise<string> {
  const gateway = env.AI.gateway(env.AI_GATEWAY_NAME);

  switch (useCase) {
    case 'openai_agents_sdk':
    case 'openai_sdk': {
      const provider = fullModelName.split('/')[0];
      
      // Native OpenAI models can use the direct provider endpoint for full feature set access
      if (provider === 'openai') {
        return await gateway.getUrl('openai');
      }
      
      // Workers AI and other providers via OpenAI SDK must use the /compat endpoint
      const gatewayBaseUrl = await gateway.getUrl();
      const baseUrl = gatewayBaseUrl.endsWith('/') ? gatewayBaseUrl : `${gatewayBaseUrl}/`;
      return `${baseUrl}compat`;
    }

    case 'worker_ai': {
      const baseUrl = await gateway.getUrl();
      const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      return `${cleanBase}compat`;
    }

    case 'google_sdk':
      return await gateway.getUrl('google-ai-studio');

    case 'anthropic_sdk':
      return await gateway.getUrl('anthropic');

    default:
      throw new Error(`Unsupported gateway use case: ${useCase}`);
  }
}

/**
 * Prefixes a model slug for the Unified/Compat endpoint.
 * Models from Workers AI (starting with `@cf/`) must be prefixed with `workers-ai/` 
 * to be correctly identified by the Unified gateway endpoint.
 * Native OpenAI models (starting with `openai/`) must have their prefix stripped.
 */
export function getCompatModelName(modelSlug: string): string {
  if (modelSlug.startsWith('@cf/')) {
    return modelSlug;
  }
  if (modelSlug.startsWith('openai/')) {
    return modelSlug.replace('openai/', '');
  }
  if (modelSlug.startsWith('google-ai-studio/')) {
    return modelSlug.replace('google-ai-studio/', '');
  }  
  if (modelSlug.startsWith('gemini/')) {
    return modelSlug.replace('gemini/', '');
  }    
  if (modelSlug.startsWith('anthropic/')) {
    return modelSlug.replace('anthropic/', '');
  }    
  return modelSlug;
}