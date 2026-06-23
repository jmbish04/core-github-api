/**
 * @file backend/src/routes/api/agents/models.ts
 * @description API endpoint to list available AI models for the frontend.
 * Merges dynamic Gemini models with hardcoded worker-ai models.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { AIProvider, REASONING_MODEL, STRUCTURING_MODEL } from '@/ai/providers';

const modelsApi = new OpenAPIHono<{ Bindings: Env }>();

const ModelsResponseSchema = z.object({
  success: z.boolean(),
  models: z.array(z.object({
    id: z.string(),
    name: z.string(),
    provider: z.string(),
    capabilities: z.array(z.string()).optional()
  }))
});

modelsApi.openapi(createRoute({
    operationId: 'getRoot',
  method: 'get',
  path: '/',
  description: 'Fetch available AI models from all providers',
  request: {
    query: z.object({
      provider: z.string().optional(),
      include_default_workerai_models: z.preprocess(
        (val) => val === 'true' || val === true,
        z.boolean().optional()
      ),
      filter: z.string().optional(),
    })
  },
  responses: {
    200: {
      description: 'Successful fetch',
      content: { 'application/json': { schema: ModelsResponseSchema } }
    },
    400: {
      description: 'Bad Request',
      content: { 'application/json': { schema: z.object({ success: z.boolean(), error: z.string(), models: z.array(z.any()) }) } }
    },
    500: {
      description: 'Server Error',
      content: { 'application/json': { schema: z.object({ success: z.boolean(), models: z.array(z.any()) }) } }
    }
  }
}), async (c) => {
  try {
    const { provider, include_default_workerai_models, filter } = c.req.valid('query');
    
    // Validate provider format if provided
    let fetchProvider: any = undefined;
    if (provider) {
        if (['google', 'gemini', 'openai', 'anthropic', 'cloudflare', 'worker-ai'].includes(provider.toLowerCase())) {
            fetchProvider = provider.toLowerCase();
        } else {
            return c.json({ success: false, error: "Invalid provider", models: [] } as any, 400);
        }
    }

    // List available models from the provider(s)
    const ai = new AIProvider(c.env);
    const models = await ai.getModels(fetchProvider, filter as any);
    
    const uniqueModelsMap = new Map();

    // Ensure Gemini 2.5 Flash is forcibly present at the top if no provider was specified or provider is google/gemini
    if (!fetchProvider || fetchProvider === 'google' || fetchProvider === 'gemini') {
      uniqueModelsMap.set('gemini-2.5-flash', { 
        id: 'gemini-2.5-flash', 
        name: 'Gemini 2.5 Flash (Recommended)', 
        provider: 'google', 
        capabilities: ['fast', 'vision', 'function_calling'] 
      });
    }

    if (include_default_workerai_models) {
        const workersAiModels = [
          { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B Instruct (Fast)', provider: 'cloudflare', capabilities: ['fast'] },
          { id: REASONING_MODEL, name: 'GPT-OSS 120B (Reasoning)', provider: 'cloudflare', capabilities: ['high_reasoning', 'function_calling'] },
          { id: STRUCTURING_MODEL, name: 'Llama 4 Scout 17B (Structuring)', provider: 'cloudflare', capabilities: ['structured_response'] },
        ];
        
        workersAiModels.forEach(m => {
            uniqueModelsMap.set(m.id, m);
        });
    }

    // Add all fetched models
    models.forEach(m => {
      // Avoid overriding if already present (like gemini-2.5-flash)
      if (!uniqueModelsMap.has(m.id)) {
          uniqueModelsMap.set(m.id, {
            id: m.id,
            name: m.name,
            provider: m.provider,
            capabilities: m.capabilities
          });
      }
    });

    // Add other provider defaults if no provider specified or if explicitly requested
    if (!fetchProvider || fetchProvider === 'openai') {
      const defaultOpenai = 'gpt-4o-mini';
      if (!uniqueModelsMap.has(defaultOpenai)) {
        uniqueModelsMap.set(defaultOpenai, { id: defaultOpenai, name: `OpenAI Default (${defaultOpenai})`, provider: 'openai', capabilities: [] });
      }
    }
    if (!fetchProvider || fetchProvider === 'anthropic') {
      const defaultAnthropic = 'claude-4-5-sonnet-latest';
      if (!uniqueModelsMap.has(defaultAnthropic)) {
        uniqueModelsMap.set(defaultAnthropic, { id: defaultAnthropic, name: `Anthropic Default (${defaultAnthropic})`, provider: 'anthropic', capabilities: [] });
      }
    }

    return c.json({
      success: true,
      models: Array.from(uniqueModelsMap.values())
    } as any, 200);
  } catch (err: any) {
    console.error('[models-api] Failed to fetch models:', err);
    return c.json({ success: false, models: [] } as any, 500);
  }
});

modelsApi.openapi(createRoute({
    operationId: 'getHealth',
  method: 'get',
  path: '/health',
  description: 'System health check for models service across all providers and filters',
  responses: {
    200: {
      description: 'Health check results',
      content: { 'application/json': { schema: z.any() } }
    }
  }
}), async (c) => {
  const providers = ['google', 'openai', 'anthropic', 'cloudflare'] as const;
  const filters = ['structured_response', 'high_reasoning', 'fast', 'vision', 'function_calling'] as const;
  
  const results: any = {
    overall: 'healthy',
    providers: {},
  };

  const ai = new AIProvider(c.env);

  // Test full list per provider
  for (const provider of providers) {
    try {
      const models = await ai.getModels(provider);
      results.providers[provider] = {
        status: models.length > 0 ? 'healthy' : 'empty',
        totalModels: models.length,
        filters: {}
      };

      // Test each filter
      for (const filter of filters) {
        const filteredModels = await ai.getModels(provider, filter as any);
        results.providers[provider].filters[filter] = {
          supported: filteredModels.length > 0,
          count: filteredModels.length,
          models: filteredModels.map(m => m.id)
        };
      }
    } catch (err: any) {
      results.overall = 'degraded';
      results.providers[provider] = {
        status: 'error',
        error: err.message
      };
    }
  }

  // Also test all providers combined
  try {
     const allModels = await ai.getModels();
     results.allProviders = {
        status: allModels.length > 0 ? 'healthy' : 'empty',
        totalModels: allModels.length
     };
  } catch (err: any) {
     results.allProviders = { status: 'error', error: err.message };
  }

  return c.json(results);
});

export default modelsApi;
