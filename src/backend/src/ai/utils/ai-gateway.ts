import { cleanJsonOutput } from '@/ai/utils/sanitizer';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Unified AI Gateway Management Class
 * Handles provider normalization, URL construction, API key resolution, 
 * and universal client generation for Cloudflare AI Gateway.
 */
export class AIGateway {
  private static readonly GATEWAY_PROVIDER_ALIASES: Record<string, string> = {
    "gemini": "google-ai-studio",
    "google": "google-ai-studio",
    "google-ai-studio": "google-ai-studio",
    "workers-ai": "workers-ai",
    "worker-ai": "workers-ai",
    "cloudflare": "workers-ai",
    "openai": "openai",
    "anthropic": "anthropic",
  };

  /**
   * Maps common provider aliases to canonical Gateway identifiers.
   */
  public static normalizeProvider(provider: string): string {
    const normalized = provider.toLowerCase().trim();
    return this.GATEWAY_PROVIDER_ALIASES[normalized] || 'compat';
  }

  /**
   * Normalizes a model string specifically for Workers AI.
   * Ensures the model string consistently follows the `workers-ai/@cf/{provider}/{model}` format.
   */
  public static normalizeWorkerAiModel(model: string): string {
    const parts = model.trim().split('/').filter(Boolean);

    if (parts.length < 2) {
      throw new Error(`Invalid model format: ${model}. Expected at least provider/model.`);
    }

    if (parts.length === 2 && parts[0] === '@cf') {
      throw new Error(`Invalid model format: ${model}. Model name missing after @cf/.`);
    }

    if (parts.length === 2) {
      return `workers-ai/@cf/${parts.join('/')}`;
    }

    return `workers-ai/@cf/${parts.slice(-2).join('/')}`;
  }

  /**
   * Safely resolves the API key for a given provider from environment bindings.
   * Returns empty string if no key is configured — callers must check before
   * sending Authorization headers.
   */
  private static async getApiKeyForProvider(env: any, provider: string): Promise<string> {
    const normalized = this.normalizeProvider(provider);
    try {
      if (normalized === 'anthropic') {
        const key = typeof env.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : await env.ANTHROPIC_API_KEY?.get();
        return key || '';
      }
      if (normalized === 'google-ai-studio') {
        let key = typeof env.GOOGLE_AI_API_KEY === 'string' ? env.GOOGLE_AI_API_KEY : await env.GOOGLE_AI_API_KEY?.get();
        if (!key) key = typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY : await env.GEMINI_API_KEY?.get();
        return key || '';
      }
      const key = typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY : await env.OPENAI_API_KEY?.get();
      return key || '';
    } catch {
      return '';
    }
  }

  /**
   * Primary initialization method.
   * Returns the exact configuration required to instantiate any AI SDK through the Gateway.
   *
   * BYOK Mode (when aigToken is present):
   *   - Provider keys are stored in the AI Gateway dashboard (Provider Keys section).
   *   - AI Gateway injects them automatically — no Authorization header needed.
   *   - apiKey is returned as '' so that callers know to omit the Authorization header.
   *   - Only `cf-aig-authorization: Bearer {aigToken}` should be sent.
   *
   * Direct Mode (when aigToken is absent):
   *   - Provider API keys must be supplied via Authorization header as usual.
   *   - apiKey is returned if available in env bindings.
   */
  public static async getBaseUrl(env: any, options: { provider: string }): Promise<{ baseUrl: string, apiKey: string, aigToken: string }> {
    const gatewayName = env.AI_GATEWAY_NAME || 'core-github-api';
    let aigToken = '';
    if (env.AI_GATEWAY_TOKEN) {
      aigToken = typeof env.AI_GATEWAY_TOKEN === 'object' && env.AI_GATEWAY_TOKEN?.get
        ? await env.AI_GATEWAY_TOKEN.get()
        : (env.AI_GATEWAY_TOKEN as string);
    }

    const normalizedProvider = this.normalizeProvider(options.provider);

    // In BYOK mode the gateway injects provider keys — caller must NOT send Authorization.
    // We return empty apiKey so consumers know to omit the Authorization header.
    const apiKey = aigToken ? '' : await this.getApiKeyForProvider(env, options.provider);

    try {
      const gateway = env.AI.gateway(gatewayName);
      let baseUrl = await gateway.getUrl(normalizedProvider);
      baseUrl = baseUrl.replace(/\/+$/, "");

      return { baseUrl, apiKey, aigToken };
    } catch (error: any) {
      console.error(`Failed to resolve AI Gateway URL for provider: ${options.provider}`, error);
      throw new Error(`Could not fetch gateway URL: ${error.message}`);
    }
  }

  /**
   * Creates a lightweight, universal fetch client for sending OpenAI-compatible
   * requests directly through the gateway.
   *
   * BYOK: when aigToken is set, the gateway injects the provider key.
   *   → Only cf-aig-authorization header is sent. No Authorization header.
   * Direct: when aigToken is absent, Authorization: Bearer {apiKey} is sent.
   */
  public static async createUniversalClient(env: any, provider: string): Promise<any> {
    const { baseUrl, apiKey, aigToken } = await this.getBaseUrl(env, { provider });

    // Build headers once: in BYOK mode omit Authorization to avoid overriding stored keys.
    const buildHeaders = (extra?: Record<string, string>) => ({
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(aigToken ? { 'cf-aig-authorization': `Bearer ${aigToken}` } : {}),
      ...extra,
    });

    return {
      chat: {
        completions: {
          create: async (body: any) => {
            const res = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: buildHeaders(),
              body: JSON.stringify(body),
            });
            if (!res.ok) {
              throw new Error(`Gateway Error: ${await res.text()}`);
            }
            return res.json();
          },
        },
      },
      models: {
        list: async () => {
          const res = await fetch(`${baseUrl}/models`, {
            method: 'GET',
            headers: buildHeaders(),
          });
          if (!res.ok) {
            throw new Error(`Gateway Error: ${await res.text()}`);
          }
          return res.json();
        },
      },
    };
  }

  private static normalizeMessages(input: any): Array<{ role: string; content: string }> {
    if (Array.isArray(input)) {
      return input.map((item) => ({
        role: String(item.role || 'user'),
        content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? ''),
      }));
    }
    return [{ role: 'user', content: String(input ?? '') }];
  }

  private static normalizeToolSchema(parameters: unknown) {
    if (parameters && typeof parameters === 'object') {
      return parameters;
    }
    return {
      type: 'object',
      properties: {},
      additionalProperties: false,
    };
  }

  public static async createUniversalGatewayRunner(env: any, provider: string, defaultModel: string) {
    const client = await this.createUniversalClient(env, provider);

    return {
      run: async (agent: any, input: any) => {
        const config = agent?.config ?? agent ?? {};
        const messages = this.normalizeMessages(input);
        const model = config.model || defaultModel;
        const request: Record<string, unknown> = {
          model,
          messages: [
            ...(config.instructions ? [{ role: 'system', content: config.instructions }] : []),
            ...messages,
          ],
        };

        if (Array.isArray(config.tools) && config.tools.length > 0) {
          request.tools = config.tools.map((definition: any) => ({
            type: 'function',
            function: {
              name: definition.name,
              description: definition.description || '',
              parameters: this.normalizeToolSchema(definition.parameters),
            },
          }));
        }

        if (config.outputType) {
          request.response_format = {
            type: 'json_schema',
            json_schema: {
              name: `${config.name || 'agent'}_output`,
              schema: zodToJsonSchema(config.outputType as any, `${config.name || 'agent'}_output`),
              strict: true,
            },
          };
        }

        const response = await client.chat.completions.create(request);
        const message = response.choices?.[0]?.message || {};
        const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

        for (const toolCall of toolCalls) {
          const toolDef = Array.isArray(config.tools)
            ? config.tools.find((candidate: any) => candidate.name === toolCall.function?.name)
            : undefined;
          if (!toolDef?.execute) {
            continue;
          }

          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(toolCall.function?.arguments || '{}');
          } catch {
            parsedArgs = {};
          }

          await toolDef.execute(parsedArgs);
        }

        let finalOutput: unknown = message.content || '';
        if (config.outputType) {
          finalOutput = JSON.parse(cleanJsonOutput(String(message.content || '{}')) || '{}');
        }

        const history = [
          ...messages,
          {
            role: 'assistant',
            content: typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput),
          },
        ];

        return {
          finalOutput,
          history,
          raw: response,
        };
      },
    };
  }

  public static async runTextWithFallback(env: any, provider: string, model: string, instructions: string, prompt: string): Promise<string> {
    const client = await this.createUniversalClient(env, provider);
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: prompt },
      ],
    });
    return response.choices?.[0]?.message?.content || '';
  }

  public static async runStructuredResponseWithModelFallback(
    env: any,
    provider: string,
    model: string,
    instructions: string,
    prompt: string,
  ): Promise<any> {
    const client = await this.createUniversalClient(env, provider);
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: prompt },
      ],
    });

    const result = response.choices?.[0]?.message?.content || '{}';
    try {
      return JSON.parse(cleanJsonOutput(result));
    } catch {
      return { reply: result };
    }
  }
}