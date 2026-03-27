#!/usr/bin/env node

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Resolve current directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Assuming this script lives in the root /scripts/ directory
const rootDir = join(__dirname, '..');

console.log('🔍 Analyzing Cloudflare Worker backend bundle size...');

try {
  // Ensure the output directory exists
  const distDir = join(rootDir, 'backend', 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Execute esbuild directly to mirror Wrangler's internal "workerd" bundling.
  // We explicitly externalize node built-ins (both prefixed and bare) to perfectly 
  // simulate 'nodejs_compat' and bypass legacy bare import errors.
  const cmd = [
    'npx esbuild backend/src/index.ts',
    '--bundle',
    '--minify',
    '--format=esm',
    '--platform=browser',
    '--conditions=workerd,worker,browser',
    '--external:cloudflare:*',
    '--external:node:*',
    '--external:path',
    '--external:crypto',
    '--external:buffer',
    '--external:stream',
    '--external:util',
    '--external:url',
    '--external:os',
    '--external:fs',
    '--external:events',
    '--external:assert',
    '--external:http',
    '--external:https',
    '--external:net',
    '--external:tls',
    '--external:zlib',
    '--external:readline',
    '--external:child_process',
    '--external:worker_threads',
    '--external:async_hooks',
    '--external:querystring',
    '--external:diagnostics_channel',
    '--external:http2',
    '--external:process',
    '--external:dns',
    '--external:perf_hooks',
    '--external:v8',
    '--external:module',
    '--external:inspector',
    '--loader:.hbs=text',
    '--outfile=backend/dist/worker.js',
    '--metafile=backend/dist/meta.json'
  ].join(' ');

  execSync(cmd, { cwd: rootDir, stdio: 'inherit' });

  console.log('\n✅ Bundle analysis complete!');
  console.log('📊 A detailed map has been saved to: backend/dist/meta.json\n');
  console.log('To visualize the exact file bloat, drag and drop the meta.json file into:');
  console.log('👉 https://esbuild.github.io/analyze/');
  console.log('\n⚠️  PRO TIP: Look for massive blocks named "node_modules/lucide-react" or "framer-motion".');

} catch (error) {
  console.error('❌ Failed to analyze bundle. Ensure backend/src/index.ts exists.');
  process.exit(1);
}