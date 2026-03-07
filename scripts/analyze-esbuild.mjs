#!/usr/bin/env node

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Resolve current directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🔍 Analyzing Cloudflare Worker backend bundle size...');

try {
  const distDir = join(rootDir, 'backend', 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Comprehensive list of Node.js built-ins supported by Cloudflare Workers (nodejs_compat)
  const nodeBuiltIns = [
    'path', 'crypto', 'buffer', 'stream', 'util', 'url', 'os', 'fs', 
    'events', 'assert', 'http', 'https', 'net', 'tls', 'zlib', 
    'readline', 'child_process', 'worker_threads', 'async_hooks', 
    'querystring', 'diagnostics_channel', 'http2', 'process', 'dns', 
    'perf_hooks', 'v8', 'module', 'inspector'
  ];

  // We explicitly tell esbuild to alias ANY bare require() of a Node module 
  // into the standard `node:*` prefix format so workerd intercepts it natively.
  const aliasFlags = nodeBuiltIns.map(mod => `--alias:${mod}=node:${mod}`);

  // Forcefully stub out massive polyfills that NPM packages try to inject into the browser build
  const edgeOptimizations = [
    '--alias:web-streams-polyfill=node:stream/web',
    '--alias:formdata-polyfill=node:buffer', // Use native FormData/Blob
  ];

  const cmd = [
    'npx esbuild backend/src/index.ts',
    '--bundle',
    '--minify',
    '--format=esm',
    '--platform=browser',
    '--target=es2022',
    '--conditions=workerd,worker,browser',
    '--main-fields=browser,module,main',
    ...aliasFlags,
    ...edgeOptimizations,
    '--external:cloudflare:*',
    '--external:node:*',
    '--loader:.hbs=text',
    '--outfile=backend/dist/worker.js',
    '--metafile=backend/dist/meta.json'
  ].join(' ');

  execSync(cmd, { cwd: rootDir, stdio: 'inherit' });

  console.log('\n✅ Edge-optimized bundle analysis complete!');
  console.log('📊 A detailed map has been saved to: backend/dist/meta.json\n');
  console.log('To visualize the exact file bloat, drag and drop the meta.json file into:');
  console.log('👉 https://esbuild.github.io/analyze/\n');

} catch (error) {
  console.error('❌ Failed to analyze bundle. Ensure backend/src/index.ts exists.');
  process.exit(1);
}
