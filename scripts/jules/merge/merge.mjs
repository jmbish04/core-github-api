import { spawn } from 'child_process';

const repo = process.argv[2];
const pr = parseInt(process.argv[3], 10);

if (!repo || isNaN(pr)) {
  console.error('Usage: node merge.mjs <repo> <pr-number>');
  process.exit(1);
}

const payload = JSON.stringify({ repo, pr });
console.log(`\nMerging PR #${pr} on ${repo}...`);
const child = spawn('npx', ['@google/jules-merge', 'merge', '--json', payload], { stdio: 'inherit' });
child.on('close', code => process.exit(code || 0));
