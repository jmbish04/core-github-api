import { Context } from "hono";
import { z } from "zod";
import { Logger } from "@/lib/logger";

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
  private logger: Logger;
  private env: Env;
  private loggerPreface: string;

  constructor(env: Env) {
    this.kv = env.KV_CONFIGS;
    this.env = env;
    this.logger = new Logger(env, 'ConfigManager');
    this.loggerPreface = '[ConfigManager]';
  }

  /**
   * Universal Get: Handles primitive conversion and secret resolution
   */
  async get(key: string, envFallback?: any): Promise<any> {
    
    this.logger.info(`${this.loggerPreface} Getting config for key: ${key}`);
    const raw = await this.kv.get(key);
    this.logger.info(`${this.loggerPreface} Raw config for key: ${key}; ${raw}`);
    if (!raw){
      this.logger.error(`${this.loggerPreface} No config found for key: ${key}`);
      return envFallback;
    }
    
    try {
        const config = JSON.parse(raw) as ConfigValue;
        this.logger.info(`${this.loggerPreface} Parsed config for key: ${key}; ${JSON.stringify(config)}`);
        
        // Logic for Secret Store managed values would happen here
        // But usually, we just return the 'value' (which might be the Secret ID)
        if (config && typeof config === 'object' && 'value' in config) {
             this.logger.info(`${this.loggerPreface} Returning config value for key: ${key}; ${config.value}`);
             return config.value;
        }
        // Fallback for legacy simple values if any
        this.logger.info(`${this.loggerPreface} Returning config value for key: ${key}; ${config}`);
        return config;
    } catch (e) {
        this.logger.error(`${this.loggerPreface} Error: ${e}; Legacy config support, return non-JSON config; ${raw}`)
        // If not JSON, return raw (legacy support)
        return raw;
    }
  }

  /**
   * Get Metadata: Returns the full configuration object (Pointer)
   */
  async getMetadata(key: string): Promise<ConfigValue | null> {
      this.logger.info(`${this.loggerPreface} getMetadata for key ${key}`);
      const raw = await this.kv.get(key);
      this.logger.info(`${this.loggerPreface} Raw metadata for key: ${key}; ${raw}`);
      if (!raw) {
        this.logger.error(`${this.loggerPreface} No metadata found for key: ${key}`);
        return null;
      }
      try {
          this.logger.info(`${this.loggerPreface} Raw config for key: ${key}; ${raw}`);
          return JSON.parse(raw) as ConfigValue;
      } catch (e) {
          this.logger.error(`${this.loggerPreface} Error: ${e}; Legacy config support, return null; ${raw}`)
          return null; 
      }
  }

  /**
   * Universal Set: Enforces metadata structure
   */
  async set(key: string, config: Partial<ConfigValue>): Promise<void> {
    this.logger.info(`${this.loggerPreface} set for key ${key}`);
    const existingRaw = await this.kv.get(key);
    
    let existing: Partial<ConfigValue> = {};
    if (existingRaw) {
        this.logger.info(`${this.loggerPreface} Raw config for key: ${key}; ${existingRaw}`);
        try {
            existing = JSON.parse(existingRaw);
            this.logger.info(`${this.loggerPreface} Raw config for key: ${key}; ${existing}`);
        } catch (e) {
            // legacy value
            existing = { value: existingRaw };
            this.logger.error(`${this.loggerPreface} Error: ${e}; Raw config for key: ${key}; ${existing}`);
        }
    }
    else{
      this.logger.info(`${this.loggerPreface} Existing Raw config for key: ${key} NOT FOUND`);
    }
    
    const merged = {
      key,
      value: config.value,
      type: config.type || existing.type || "string",
      category: config.category || existing.category || "general",
      ...existing,
      ...config
    };

    this.logger.info(`${this.loggerPreface} Merging config and updating KV: ${key}; ${merged}`);
    
    await this.kv.put(key, JSON.stringify(merged));
  }

  async getAll(): Promise<ConfigValue[]> {
    this.logger.info(`${this.loggerPreface} getAll -- obtaining all configs`);
    const list = await this.kv.list();
    this.logger.info(`${this.loggerPreface} getAll -- obtained all configs ${list}`);
    const results: ConfigValue[] = [];
    for (const key of list.keys) {
      const val = await this.kv.get(key.name);
      this.logger.info(`${this.loggerPreface} getAll -- ${key}: ${val}`);
      if (val) {
          try {
              results.push(JSON.parse(val));
          } catch (e) {
            this.logger.info(`${this.loggerPreface} Error: ${e}; Legacy Support: -- ${key.name}: ${val}`);
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
    this.logger.info(`${this.loggerPreface} getAll -- Returning Results ${results}`);
    return results;
  }
}

/**
 * Helper to initialize the manager within a Hono context.
 */
export const getConfigManager = (c: Context<{ Bindings: Env }>) => {
  return new ConfigManager(c.env);
};
