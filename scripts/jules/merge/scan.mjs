import { spawn } from 'child_process';

const repo = process.argv[2];
const prsStr = process.argv[3];
const base = process.argv[4] || 'main';

if (!repo || !prsStr) {
  console.error('Usage: node scan.mjs <repo> <prs-comma-separated> [base]');
  process.exit(1);
}

const prs = prsStr.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
const payload = JSON.stringify({ prs, repo, base });

console.log(`\nScanning PRs ${prs.join(', ')} for conflicts on ${repo} (base: ${base})...`);
const child = spawn('npx', ['@google/jules-merge', 'scan', '--json', payload], { stdio: 'inherit' });
child.on('close', code => process.exit(code || 0));
