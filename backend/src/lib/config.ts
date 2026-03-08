import { Context } from "hono";
import { z } from "zod";

/**
 * Metadata for UI rendering and validation
 */
export const ConfigValueSchema = z.object({
  key: z.string(),
  value: z.any(),
  type: z.enum(["string", "number", "boolean", "secret", "json"]),
  category: z.string().default("general"),
  description: z.string().optional(),

  // Secret Store specific flags
  isSecretStoreManaged: z.boolean().default(false), // If true, value is a Secret ID
  secretName: z.string().optional(), // The name in CF Secret Store
});

export type ConfigValue = z.infer<typeof ConfigValueSchema>;

/**
 * The full store schema is a record of these values
 */
export const FullConfigSchema = z.record(z.string(), ConfigValueSchema);

export class ConfigManager {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Universal Get: Handles primitive conversion and secret resolution
   */
  async get(key: string, envFallback?: any): Promise<any> {
    const raw = await this.kv.get(key);
    if (!raw) return envFallback;
    
    try {
        const config = JSON.parse(raw) as ConfigValue;
        
        // Logic for Secret Store managed values would happen here
        // But usually, we just return the 'value' (which might be the Secret ID)
        if (config && typeof config === 'object' && 'value' in config) {
             return config.value;
        }
        // Fallback for legacy simple values if any
        return config;
    } catch (e) {
        // If not JSON, return raw (legacy support)
        return raw;
    }
  }

  /**
   * Get Metadata: Returns the full configuration object (Pointer)
   */
  async getMetadata(key: string): Promise<ConfigValue | null> {
      const raw = await this.kv.get(key);
      if (!raw) return null;
      try {
          return JSON.parse(raw) as ConfigValue;
      } catch (e) {
          return null; 
      }
  }

  /**
   * Universal Set: Enforces metadata structure
   */
  async set(key: string, config: Partial<ConfigValue>): Promise<void> {
    const existingRaw = await this.kv.get(key);
    let existing: Partial<ConfigValue> = {};
    if (existingRaw) {
        try {
            existing = JSON.parse(existingRaw);
        } catch (e) {
            // legacy value
            existing = { value: existingRaw };
        }
    }
    
    const merged = {
      key,
      value: config.value,
      type: config.type || existing.type || "string",
      category: config.category || existing.category || "general",
      ...existing,
      ...config
    };
    
    await this.kv.put(key, JSON.stringify(merged));
  }

  async getAll(): Promise<ConfigValue[]> {
    const list = await this.kv.list();
    const results: ConfigValue[] = [];
    for (const key of list.keys) {
      const val = await this.kv.get(key.name);
      if (val) {
          try {
              results.push(JSON.parse(val));
          } catch (e) {
              // Legacy support: wrap raw value
              results.push({
                  key: key.name,
                  value: val,
                  type: "string",
                  category: "general",
                  isSecretStoreManaged: false
              });
          }
      }
    }
    return results;
  }
}

/**
 * Helper to initialize the manager within a Hono context.
 */
export const getConfigManager = (c: Context<{ Bindings: Env }>) => {
  return new ConfigManager(c.env.KV_CONFIGS);
};
