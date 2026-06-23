/**
 * AI Configuration & Provider Resolution Module
 * 
 * Centralizes the logic for:
 * 1. AI Provider normalization and resolution from environment variables.
 * 2. Model selection for specific agent modules.
 * 3. AI Gateway URL construction according to different SDK use cases.
 * 4. Model name normalization for cross-provider compatibility.
 * 
 * @module AI/Providers/Config
 */

/** Supported AI provider identifiers. */
export type SupportedProvider =
  | 'worker-ai'
  | 'workers-ai'
  | 'openai'
  | 'gemini'
  | 'google-ai-studio'
  | 'jules'
  | 'anthropic';

/** Use case for capability-based model resolution. */
export type ModelUseCase = 'text' | 'structured' | 'vision' | 'embeddings' | 'functions';

/** Default fallback provider. */
export const DEFAULT_AI_PROVIDER: SupportedProvider = 'worker-ai';
/** Default high-performance model for Workers AI. */
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/**
 * Valid SDK use cases for determining the correct Gateway endpoint format.
 */
/**
 * Defined Use Cases for AI Gateway endpoint resolution.
 * - openai_agents_sdk: Used by the repo-local compatibility runtime layered over AI Gateway.
 * - openai_sdk: Standard OpenAI client usage.
 * - worker_ai: Raw Workers AI REST interactions.
 * - google_sdk: Official Google Generative AI SDK.
 * - anthropic_sdk: Official Anthropic SDK.
 */
export type GatewayUseCase = 
  | 'openai_agents_sdk' 
  | 'openai_sdk' 
  | 'worker_ai' 
  | 'google_sdk' 
  | 'anthropic_sdk';

// ==========================================
// Model & Provider Resolution
// ==========================================

/**
 * Normalizes provider strings into the `SupportedProvider` union.
 * 
 * @param provider - Raw input string (e.g., 'Google', 'Workers-AI').
 * @returns A validated provider key.
 */
export function normalizeProvider(provider?: string): SupportedProvider {
  if (!provider) {
    return DEFAULT_AI_PROVIDER;
  }

  const normalized = provider.toLowerCase().trim();
  if (normalized === 'worker-ai' || normalized === 'workers-ai') {
    return 'worker-ai';
  }
  if (normalized === 'openai') {
    return 'openai';
  }
  if (normalized === 'gemini' || normalized === 'google' || normalized === 'google-ai-studio') {
    return 'gemini';
  }
  if (normalized === 'jules') {
    return 'jules';
  }
  if (normalized === 'anthropic') {
    return 'anthropic';
  }

  return DEFAULT_AI_PROVIDER;
}

/**
 * Resolves the primary AI provider from the environment.
 * Checks `AI_DEFAULT_PROVIDER` or `AI_PROVIDER`.
 * 
 * @param env - Cloudflare Environment bindings.
 * @returns The resolved provider key.
 */
export function resolveDefaultAiProvider(env: Partial<Env>): SupportedProvider {
  const configured =
    (env as Partial<Env> & { AI_DEFAULT_PROVIDER?: string; AI_PROVIDER?: string }).AI_DEFAULT_PROVIDER ||
    (env as Partial<Env> & { AI_DEFAULT_PROVIDER?: string; AI_PROVIDER?: string }).AI_PROVIDER;
  return normalizeProvider(configured);
}

/**
 * Default model matrix — maps each provider × use case to the optimal model.
 */
const MODEL_MATRIX: Record<string, Record<ModelUseCase, string>> = {
  'worker-ai': {
    text: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    structured: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    functions: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    vision: '@cf/llava-hf/llava-1.5-7b-hf',
    embeddings: '@cf/baai/bge-base-en-v1.5',
  },
  'openai': {
    text: 'gpt-4o',
    structured: 'gpt-4o',
    functions: 'gpt-4o',
    vision: 'gpt-4o',
    embeddings: 'text-embedding-3-small',
  },
  'gemini': {
    text: 'gemini-2.5-flash',
    structured: 'gemini-2.5-flash',
    functions: 'gemini-2.5-flash',
    vision: 'gemini-2.5-flash',
    embeddings: 'text-embedding-004',
  },
  'anthropic': {
    text: 'claude-4-5-sonnet-latest',
    structured: 'claude-4-5-sonnet-latest',
    functions: 'claude-4-5-sonnet-latest',
    vision: 'claude-4-5-sonnet-latest',
    embeddings: '@cf/baai/bge-base-en-v1.5',
  },
  'jules': {
    text: 'jules',
    structured: 'jules',
    functions: 'jules',
    vision: 'jules',
    embeddings: 'jules',
  },
};

/**
 * Resolves the default AI model for a given provider, use case, and environment.
 * Returns the optimal model for the specific capability requested.
 *
 * Resolution order:
 * 1. Explicit env variable override (e.g. `AI_DEFAULT_MODEL`)
 * 2. Provider-specific env override (e.g. `OPENAI_MODEL`)
 * 3. Capability-based matrix lookup
 * 4. Fallback to worker-ai equivalent
 *
 * @param env - Cloudflare Environment bindings.
 * @param provider - Target provider to resolve for.
 * @param useCase - The capability needed (text, structured, vision, embeddings, functions).
 * @returns The model identifier string.
 */
export function resolveDefaultAiModel(env: Partial<Env>, provider?: SupportedProvider | 'jules', useCase: ModelUseCase = 'text'): string {
  // Check for explicit global override — only applies to non-embeddings/vision use cases
  // so a global text model override doesn't accidentally route embeddings to a chat model
  if (useCase === 'text' || useCase === 'structured' || useCase === 'functions') {
    const model =
      (env as Partial<Env> & { AI_DEFAULT_MODEL?: string; WORKERS_AI_MODEL?: string }).AI_DEFAULT_MODEL ||
      (env as Partial<Env> & { AI_DEFAULT_MODEL?: string; WORKERS_AI_MODEL?: string }).WORKERS_AI_MODEL;

    if (model && model.trim()) {
      return model.trim();
    }
  }

  const effectiveProvider = provider || resolveDefaultAiProvider(env);

  // Check provider-specific env overrides (only for text/structured/functions)
  if (useCase === 'text' || useCase === 'structured' || useCase === 'functions') {
    if (effectiveProvider === 'openai') {
      const envModel = (env as Partial<Env> & { OPENAI_MODEL?: string }).OPENAI_MODEL;
      if (envModel) {
        const openaiStr = String(envModel);
        if (openaiStr.startsWith('gpt-5')) return 'gpt-4o';
        return envModel;
      }
    }
    if (effectiveProvider === 'gemini' || effectiveProvider === 'google-ai-studio') {
      const envModel = (env as Partial<Env> & { GEMINI_MODEL?: string }).GEMINI_MODEL;
      if (envModel) {
        const geminiStr = String(envModel);
        if (geminiStr.includes('gemini-1.5') || geminiStr.includes('gemini-2.0')) return 'gemini-2.5-flash';
        return envModel;
      }
    }
    if (effectiveProvider === 'anthropic') {
      const envModel = (env as Partial<Env> & { ANTHROPIC_MODEL?: string }).ANTHROPIC_MODEL;
      if (envModel) return envModel;
    }
  }

  // Normalize workers-ai variant
  const matrixKey = (effectiveProvider === 'workers-ai' || effectiveProvider === 'google-ai-studio')
    ? (effectiveProvider === 'workers-ai' ? 'worker-ai' : 'gemini')
    : effectiveProvider;

  return MODEL_MATRIX[matrixKey]?.[useCase] || MODEL_MATRIX['worker-ai'][useCase];
}

/**
 * Retrieves the configured model slug for a given agent or module.
 */
/**
 * Mapping function to retrieve task-specific model slugs.
 * Supports a global `USE_OPENAI_MODELS` toggle to switch between 
 * OpenAI (Reliability) and Workers AI (Cost) modes.
 * 
 * @param moduleName - The identifier/key for the agent module (e.g., 'finance-critic').
 * @param env - Cloudflare Environment bindings.
 * @returns The model slug to use for the agent.
 */
export const getAgentModel = (moduleName: string, env?: Env): string => {
  // Default to TRUE if env is missing or varies
  const useOpenAI = (env?.USE_OPENAI_MODELS as boolean | undefined) !== false; 

  if (useOpenAI) {
    const models: Record<string, string> = {
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
      'global-judge': '@cf/openai/gpt-oss-120b',
      'finance-orchestrator': '@cf/openai/gpt-oss-120b',
      'legal-orchestrator': '@cf/openai/gpt-oss-120b',
      'compliance-orchestrator': '@cf/openai/gpt-oss-120b',
      'remedy': '@cf/openai/gpt-oss-120b',
      'document-processor': '@cf/openai/gpt-oss-120b',
      'warehouse': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'finance': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'invoice-auditor': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'finance-critic': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'legal': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'warranty-analyst': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'compliance': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'license-investigator': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'timeline': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'timeline-extractor': '@cf/openai/gpt-oss-120b',
      'timeline-evaluator': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'remedy-rewriter': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'recall-helper': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'default': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'fallback': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    };
    return models[moduleName] || models['default'];
  }
};

// Gateway URL construction is now centralized in AIGateway class
// at src/ai/providers/ai-gateway.ts — do NOT duplicate here.


/**
 * Normalizes model slugs for compatibility with specific provider endpoints.
 * E.g., strips 'openai/' prefix for native OpenAI calls.
 * 
 * @param modelSlug - The raw model name.
 * @returns The normalized model name.
 */
export function getCompatModelName(modelSlug: string): string {
  if (modelSlug.startsWith('@cf/')) {
    // When routing Workers AI models through /compat, prepend the workers-ai/ provider segment
    return `workers-ai/${modelSlug}`;
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
