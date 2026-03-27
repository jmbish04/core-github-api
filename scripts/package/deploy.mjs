#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Initiating optimized Cloudflare deployment...');

// 1. Prepare environment variables
const env = { 
  ...process.env,
  // Keep the memory buffer, but rely on spawnSync to isolate the Wrangler execution
  NODE_OPTIONS: '--max-old-space-size=8192',
  NODE_ENV: 'production'
};

// 2. (Removed) Allow transparent JIT token passthrough from .zshrc wrappers.

const wranglerPath = join(__dirname, '..', '..', 'node_modules', '.bin', 'wrangler');

// 3. Execute Wrangler without minification to prevent esbuild silent OOM crashes 
//    on massive Drizzle schemas (127+ tables).
console.log('📦 Running Wrangler deploy (Minification disabled for memory stability)...');

const result = spawnSync(wranglerPath, ['deploy'], { 
  stdio: 'inherit',
  env,
  shell: true // Ensures proper binary execution mapping
});

// 4. Explicitly trap and expose silent process deaths
if (result.error) {
  console.error('❌ Failed to spawn Wrangler process:', result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`❌ Deployment failed with exit code ${result.status}. Review the logs above.`);
  // If status is null, the process was abruptly assassinated by the OS (e.g., OOM)
  if (result.signal) {
    console.error(`💀 CRITICAL: Wrangler process was killed by OS signal: ${result.signal}`);
  }
  process.exit(1);
}

console.log('✅ Deployment successful.');
