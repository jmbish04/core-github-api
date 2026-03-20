import { spawn } from 'child_process';

const repo = process.argv[2];
const branch = process.argv[3];
const message = process.argv.slice(4).join(' ');

if (!repo || !branch) {
  console.error('Usage: node push.mjs <repo> <branch> [message]');
  process.exit(1);
}

const payload = JSON.stringify({ repo, branch, message: message || 'Reconcile PRs' });
console.log(`\nPushing reconciliation PR to ${branch} on ${repo}...`);
const child = spawn('npx', ['@google/jules-merge', 'push', '--json', payload], { stdio: 'inherit' });
child.on('close', code => process.exit(code || 0));
