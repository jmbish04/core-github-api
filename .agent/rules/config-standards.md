# Configuration Standards

- **KV First**: Always attempt to retrieve configuration from `KV_CONFIGS` via the `ConfigManager` before falling back to `c.env`.
- **Type Safety**: Any new configuration key MUST be added to the `ConfigSchema` in `src/lib/config.ts`.
- **Validation**: Use Zod for all incoming config updates.
- **Sensitive Data**: Never log the actual values of keys retrieved from KV or Env.
