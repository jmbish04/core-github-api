import { Bindings } from './hono';

export async function logSecretStatus(env: Env) {
  console.log('🔍 [DEBUG] Checking Secrets Availability...');

  const secretsToCheck: (keyof Bindings)[] = [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'GITHUB_TOKEN',
    'WORKER_API_KEY',
    'AI_GATEWAY_TOKEN',
    'CLOUDFLARE_API_TOKEN'
  ];

  for (const key of secretsToCheck) {
    try {
      const secretObj = env[key] as any;
      
      if (!secretObj) {
        console.error(`❌ [DEBUG] Secret binding '${key}' is UNDEFINED on env.`);
        continue;
      }

      // Check if it's a Fetcher/SecretsStoreSecret with .get()
      if (typeof secretObj.get === 'function') {
        const value = await secretObj.get();
        if (value) {
            const masked = value.substring(0, 3) + '...' + value.substring(value.length - 3);
            console.log(`✅ [DEBUG] ${key} (via .get()): Present (${masked})`);
        } else {
            console.error(`❌ [DEBUG] ${key} (via .get()): RETURNED NULL/EMPTY`);
        }
      } else if (typeof secretObj === 'string') {
        const masked = secretObj.substring(0, 3) + '...' + secretObj.substring(secretObj.length - 3);
        console.log(`✅ [DEBUG] ${key} (direct string): Present (${masked})`);
      } else {
         console.warn(`⚠️ [DEBUG] ${key}: Unknown type (${typeof secretObj})`);
         console.dir(secretObj);
      }
    } catch (error) {
      console.error(`🔥 [DEBUG] Error checking ${key}:`, error);
    }
  }
  console.log('🏁 [DEBUG] Secrets check complete.');
}
