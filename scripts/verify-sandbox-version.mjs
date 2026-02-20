import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('[Sandbox Check] Verifying @cloudflare/sandbox SDK version matches Dockerfile targets...');

// 1. Get the installed version of @cloudflare/sandbox
let installedVersion = '';
try {
  const pkgPath = path.join(__dirname, '../node_modules/@cloudflare/sandbox/package.json');
  const pkgStr = fs.readFileSync(pkgPath, 'utf8');
  installedVersion = JSON.parse(pkgStr).version;
} catch (error) {
  console.error('[Sandbox Check] Error: Could not resolve @cloudflare/sandbox/package.json. Run pnpm install first?');
  process.exit(1);
}

// 2. Read the Dockerfile
const dockerfilePath = path.join(__dirname, '../container/Dockerfile');
if (!fs.existsSync(dockerfilePath)) {
  console.error('[Sandbox Check] Error: Could not find container/Dockerfile');
  process.exit(1);
}

const dockerfile = fs.readFileSync(dockerfilePath, 'utf-8');
const lines = dockerfile.split('\n');
let mismatchCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith('FROM docker.io/cloudflare/sandbox:')) {
    // Extract the version part. Format: FROM docker.io/cloudflare/sandbox:<VERSION>[-variant] [AS name]
    const match = line.match(/cloudflare\/sandbox:([0-9\.]+)(?:-\w+)?/);
    if (match) {
      const dockerfileVersion = match[1];
      if (dockerfileVersion !== installedVersion) {
        console.error(`[Sandbox Check] Mismatch on line ${i + 1}:`);
        console.error(`  - Dockerfile expects: ${dockerfileVersion}`);
        console.error(`  - Installed SDK is:   ${installedVersion}`);
        mismatchCount++;
      }
    }
  }
}

if (mismatchCount > 0) {
  console.error('\n[Sandbox Check] FAILED ❌');
  console.error('The Dockerfile image tags MUST exactly match the installed @cloudflare/sandbox SDK version.');
  console.error('Mismatched versions can cause features to break or trigger 500 Internal Server Errors.');
  console.error('Please update container/Dockerfile AND package.json to synchronize these versions, then run pnpm install.');
  process.exit(1);
}

console.log(`[Sandbox Check] Passed ✅ : Dockerfile variants successfully synced with SDK v${installedVersion}`);

// 3. Check for SDK updates
try {
  console.log('[Sandbox Check] Checking for @cloudflare/sandbox updates...');
  const latestVersionStr = execSync('pnpm info @cloudflare/sandbox version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  
  if (latestVersionStr && latestVersionStr !== installedVersion) {
    console.log(`\n[Sandbox Check] ⚠️  NEW VERSION AVAILABLE: v${latestVersionStr} (Current: v${installedVersion})`);
    console.log('To update the Sandbox SDK, you must update BOTH the package and the Docker layers:');
    console.log(`  1. Run: pnpm add @cloudflare/sandbox@${latestVersionStr}`);
    console.log(`  2. Edit container/Dockerfile to exactly match: FROM docker.io/cloudflare/sandbox:${latestVersionStr}`);
    console.log('NOTE: Running updates without syncing the Dockerfile will cause 500 errors in execution!\n');
  } else {
    console.log('[Sandbox Check] SDK is up to date.');
  }
} catch (error) {
  console.log('[Sandbox Check] Could not check for updates (network issue or pnpm not configured). Skipping update check.');
}
