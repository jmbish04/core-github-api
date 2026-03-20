import { z } from "zod";


// -----------------------------------------------------------------------------
// Zod Validation Schemas
// -----------------------------------------------------------------------------

export const CloudflareErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  documentation_url: z.string().optional(),
});

export const CloudflareEnvelopeSchema = z.object({
  success: z.boolean(),
  errors: z.array(CloudflareErrorSchema),
  messages: z.array(CloudflareErrorSchema).optional(),
});

export const ResultInfoSchema = z.object({
  page: z.number().optional(),
  per_page: z.number().optional(),
  count: z.number().optional(),
  total_count: z.number().optional(),
});

export const SecretStoreQuotaSchema = z.object({
  secrets: z.number(),
});

export const SecretStoreSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  created: z.string().optional(),
  modified: z.string().optional(),
});

export const SecretSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  created: z.string().optional(),
  modified: z.string().optional(),
  scopes: z.array(z.string()).optional(),
});

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SecretStoreEnv {
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_SECRETS_STORE_TOKEN: string;
}

export type SecretStoreQuota = z.infer<typeof SecretStoreQuotaSchema>;
export type SecretStore = z.infer<typeof SecretStoreSchema>;
export type Secret = z.infer<typeof SecretSchema>;

export interface CreateSecretPayload {
  name: string;
  text: string;
  scopes?: string[];
}

export interface PatchSecretPayload {
  text?: string;
  scopes?: string[];
}

// -----------------------------------------------------------------------------
// Cloudflare Secrets Store Client
// -----------------------------------------------------------------------------

export class CloudflareSecretsStoreClient {
  private accountId: string;
  private token: string;
  private baseUrl: string;

  constructor(environment: SecretStoreEnv) {
    if (!environment.CLOUDFLARE_ACCOUNT_ID || !environment.CLOUDFLARE_SECRETS_STORE_TOKEN) {
      throw new Error("Missing required Cloudflare environment variables: CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_SECRETS_STORE_TOKEN");
    }
    this.accountId = environment.CLOUDFLARE_ACCOUNT_ID;
    this.token = environment.CLOUDFLARE_SECRETS_STORE_TOKEN;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/secrets_store`;
  }

  /**
   * Internal API fetcher handling Cloudflare Envelope unwrapping and error checking.
   */
  private async fetchApi(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });
    
    // Deletions without response body
    if (response.status === 204) {
      return { success: true, errors: [], messages: [] };
    }

    const data = await response.json();
    
    const envelope = CloudflareEnvelopeSchema.parse(data);
    if (!envelope.success) {
      const errorMsg = envelope.errors.map(e => `[${e.code}] ${e.message}`).join(", ");
      throw new Error(`Cloudflare Secrets Store API Error: ${errorMsg}`);
    }

    return data;
  }

  // --- Quota ---

  /**
   * Lists the number of secrets used in the account.
   */
  async getQuota(): Promise<SecretStoreQuota> {
    const data = await this.fetchApi("/quota");
    return SecretStoreQuotaSchema.parse(data.result);
  }

  // --- Stores ---

  /**
   * Lists all the stores in an account.
   */
  async listStores(): Promise<SecretStore[]> {
    const data = await this.fetchApi("/stores");
    return z.array(SecretStoreSchema).parse(data.result);
  }

  /**
   * Creates a store in the account.
   */
  async createStore(name: string): Promise<SecretStore> {
    const data = await this.fetchApi("/stores", {
      method: "POST",
      body: JSON.stringify({ name })
    });
    // Cloudflare SinglePage arrays vs Standard Envelope objects handling
    const result = Array.isArray(data.result) ? data.result[0] : data.result;
    return SecretStoreSchema.parse(result);
  }

  /**
   * Deletes a single store.
   */
  async deleteStore(storeId: string): Promise<SecretStore> {
    const data = await this.fetchApi(`/stores/${storeId}`, {
      method: "DELETE"
    });
    return SecretStoreSchema.parse(data.result);
  }

  // --- Secrets ---

  /**
   * Lists all store secrets.
   */
  async listSecrets(storeId: string): Promise<Secret[]> {
    const data = await this.fetchApi(`/stores/${storeId}/secrets`);
    return z.array(SecretSchema).parse(data.result);
  }

  /**
   * Returns details of a single secret.
   */
  async getSecret(storeId: string, secretId: string): Promise<Secret> {
    const data = await this.fetchApi(`/stores/${storeId}/secrets/${secretId}`);
    return SecretSchema.parse(data.result);
  }

  /**
   * Creates a secret in the account.
   */
  async createSecret(storeId: string, payload: CreateSecretPayload): Promise<Secret> {
    const data = await this.fetchApi(`/stores/${storeId}/secrets`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const result = Array.isArray(data.result) ? data.result[0] : data.result;
    return SecretSchema.parse(result);
  }

  /**
   * Updates a single secret.
   */
  async patchSecret(storeId: string, secretId: string, payload: PatchSecretPayload): Promise<Secret> {
    const data = await this.fetchApi(`/stores/${storeId}/secrets/${secretId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    return SecretSchema.parse(data.result);
  }

  /**
   * Deletes a single secret.
   */
  async deleteSecret(storeId: string, secretId: string): Promise<Secret> {
    const data = await this.fetchApi(`/stores/${storeId}/secrets/${secretId}`, {
      method: "DELETE"
    });
    return SecretSchema.parse(data.result);
  }

  /**
   * Deletes one or more secrets.
   */
  async deleteSecrets(storeId: string, secretIds: string[]): Promise<Secret[]> {
    const data = await this.fetchApi(`/stores/${storeId}/secrets`, {
      method: "DELETE",
      body: JSON.stringify(secretIds) 
    });
    return z.array(SecretSchema).parse(data.result);
  }

  /**
   * Duplicates the secret, keeping the value.
   */
  async duplicateSecret(storeId: string, secretId: string): Promise<Secret> {
    const data = await this.fetchApi(`/stores/${storeId}/secrets/${secretId}/duplicate`, {
      method: "POST"
    });
    return SecretSchema.parse(data.result);
  }

  /**
   * Fetch the actual secret value from Cloudflare Secret Store.
   * Note: This relies on the API exposing the value, which is generally restricted.
   */
  async getSecretValue(storeId: string, secretId: string): Promise<string> {
      try {
        const data = await this.fetchApi(`/stores/${storeId}/secrets/${secretId}`) as any;
        // Check if text/value is present in the result
        return data.result.text || data.result.value || ""; 
      } catch (e) {
         console.warn(`[CloudflareSecretsStoreClient] Failed to fetch value for secret ${secretId}.`, e);
         throw e;
      }
  }

  /**
   * Helper to find a secret by name in a given store.
   * Useful when we only have the name (e.g. from existing config).
   */
  async getSecretByName(storeId: string, name: string): Promise<Secret | undefined> {
      const secrets = await this.listSecrets(storeId);
      return secrets.find(s => s.name === name);
  }

  /**
   * Helper to get the first available store or find one by name.
   */
  async getDefaultStore(name?: string): Promise<SecretStore> {
      const stores = await this.listStores();
      if (stores.length === 0) {
          throw new Error("No Secret Stores found in this account.");
      }
      if (name) {
          const found = stores.find(s => s.name === name);
          if (!found) throw new Error(`Secret Store '${name}' not found.`);
          return found;
      }
      return stores[0];
  }
}

// -----------------------------------------------------------------------------
// Factory Function
// -----------------------------------------------------------------------------

/**
 * Creates an instance of CloudflareSecretsStoreClient using the provided Env.
 * Authenticates using the Worker's Secrets Store bindings directly.
 */
export async function getSecretsStoreClient(env: Env): Promise<CloudflareSecretsStoreClient> {
  // Use direct binding .get() calls as per architecture
  // Mapping CLOUDFLARE_SECRETS_STORE_TOKEN binding to the client's token expectation
  const accountId = await env.CLOUDFLARE_ACCOUNT_ID.get();
  const token = await env.CLOUDFLARE_SECRETS_STORE_TOKEN.get();

  const errors: string[] = [];

  if (!accountId) {
    errors.push("CLOUDFLARE_ACCOUNT_ID is missing in Secrets Store bindings.");
  }

  if (!token) {
    errors.push("CLOUDFLARE_SECRETS_STORE_TOKEN is missing in Secrets Store bindings.");
  }

  if (errors.length > 0) {
    throw new Error(`Missing required Cloudflare credentials: ${errors.join(", ")}`);
  }

  return new CloudflareSecretsStoreClient({
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_SECRETS_STORE_TOKEN: token 
  });
}