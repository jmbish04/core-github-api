/**
 * AI Gateway Provider Keys Module
 * 
 * Centralizes retrieval and validation of API keys for AI Providers.
 * Keys are retrieved securely from environment bindings and validated
 * directly against the native provider endpoints before use.
 * 
 * @module AI/Providers/AIGateway/Keys
 */
// src/backend/src/ai/providers/ai-gateway/provider-key.ts

import { normalizeProvider } from './normalize';
import { Logger } from '@/lib/logger';
import { getSecret } from '@/utils/secrets';

export class ProviderKey {
  private logger: Logger;

  constructor(private env: Env) {
    this.logger = new Logger(env, 'ProviderKey');
  }

  /**
   * Main entry point to retrieve a masked-logged API key for any provider.
   */
  async get(provider: string): Promise<string> {
    const normalized = normalizeProvider(provider);
    
    this.logger.info(`Retrieving API key`, { 
      requested: provider, 
      normalized 
    });

    try {
      let key: string | null | undefined = null;

      switch (normalized) {
        case 'anthropic':
          key = await getSecret(this.env, 'ANTHROPIC_API_KEY');
          break;

        case 'google-ai-studio':
        case 'gemini':
          key = await getSecret(this.env, 'GEMINI_API_KEY');
          break;

        case 'openai':
          key = await getSecret(this.env, 'OPENAI_API_KEY');
          break;

        case 'jules':
          key = await getSecret(this.env, 'JULES_API_KEY');
          break;

        case 'stitch':
          key = await getSecret(this.env, 'STITCH_API_KEY');
          break;

        default: {
          const msg = `No configuration found for provider: ${provider}, normalized: ${normalized}`;
          this.logger.error(msg);
          throw new Error(msg);
        }
      }

      if (!key) {
        const msg = `API key for ${normalized} is empty or undefined`;
        this.logger.error(`Unable to locate the API Key`, { provider: normalized });
        throw new Error(msg);
      }

      // Explicitly log the found key using the mask utility
      this.logger.info(`API Key Located`, {
        provider: normalized,
        apiKey: this.logger.mask(key) 
      });

      // Validate directly as requested
      const validator = new DirectApiKeyValidator();
      let validationResult: ValidationResult | { isValid: true } = { isValid: true };
      
      switch (normalized) {
        case 'openai': validationResult = await validator.validateOpenAI(key); break;
        case 'anthropic': validationResult = await validator.validateAnthropic(key); break;
        case 'gemini':
        case 'google-ai-studio': validationResult = await validator.validateGemini(key); break;
      }

      if (validationResult.isValid) {
        this.logger.info(`Key Validated: Yes`, { provider: normalized });
      } else {
        const vr = validationResult as ValidationResult;
        this.logger.error(`Key Validated: No`, { 
          provider: normalized, 
          error: vr.error,
          metadata: vr.metadata
        });
        throw new Error(`API key validation failed for ${normalized}`);
      }

      return key;
    } catch (error: any) {
      const errorMsg = `Key Retrieval/Validation Failed: ${error.message}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }
}

export async function getApiKeyForProvider(env: Env, provider: string): Promise<string> {
  const pk = new ProviderKey(env);
  return await pk.get(provider);
}

export async function getJulesKey(env: Env): Promise<string> {
  const pk = new ProviderKey(env);
  return await pk.get('jules');
}

export type ValidationResult = {
  isValid: boolean;
  provider: 'openai' | 'anthropic' | 'gemini';
  error?: string;
  metadata?: {
    status: number;
    statusText: string;
    requestId?: string | null;
  };
};

export class DirectApiKeyValidator {
  /**
   * Validates OpenAI key via direct GET to /v1/models
   */
  async validateOpenAI(apiKey: string): Promise<ValidationResult> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      return {
        isValid: response.ok,
        provider: 'openai',
        metadata: {
          status: response.status,
          statusText: response.statusText,
          requestId: response.headers.get('x-request-id'),
        },
      };
    } catch (err: any) {
      return { isValid: false, provider: 'openai', error: err.message };
    }
  }

  /**
   * Validates Anthropic key via direct POST to /v1/messages (minimal 1-token request)
   */
  async validateAnthropic(apiKey: string): Promise<ValidationResult> {
    try {
      // Anthropic requires a request body to validate effectively
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });

      return {
        isValid: response.ok,
        provider: 'anthropic',
        metadata: {
          status: response.status,
          statusText: response.statusText,
          requestId: response.headers.get('request-id'),
        },
      };
    } catch (err: any) {
      return { isValid: false, provider: 'anthropic', error: err.message };
    }
  }

  /**
   * Validates Gemini key via direct GET to /v1beta/models
   */
  async validateGemini(apiKey: string): Promise<ValidationResult> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { method: 'GET' }
      );

      return {
        isValid: response.ok,
        provider: 'gemini',
        metadata: {
          status: response.status,
          statusText: response.statusText,
        },
      };
    } catch (err: any) {
      return { isValid: false, provider: 'gemini', error: err.message };
    }
  }
}

/**
 * Direct validation by hitting the provider API instead of just checking for presence
 */
export async function verifyApiKey(env: Env, provider: string): Promise<boolean> {
  try {
    const key = await getApiKeyForProvider(env, provider);
    if (!key) return false;

    const validator = new DirectApiKeyValidator();
    const normalized = normalizeProvider(provider);

    switch (normalized) {
      case 'openai':
        return (await validator.validateOpenAI(key)).isValid;
      case 'anthropic':
        return (await validator.validateAnthropic(key)).isValid;
      case 'gemini':
      case 'google-ai-studio':
        return (await validator.validateGemini(key)).isValid;
      default:
        // For other providers (like workers-ai, jules) we assume true if key exists
        return true; 
    }
  } catch {
    return false;
  }
}

export async function verifyProviderApiKey(env: Env, provider: string): Promise<boolean> {
  try {
    const key = await getApiKeyForProvider(env, provider);
    return !!key;
  } catch {
    return false;
  }
}