import { spawn } from 'child_process';

const repo = process.argv[2];
const source = process.argv[3];
const filePath = process.argv.slice(4).join(' ');

if (!repo || !source || !filePath) {
  console.error('Usage: node get-contents.mjs <repo> <source: "base"|"main"|"pr:N"> <file-path>');
  process.exit(1);
}

const payload = JSON.stringify({ filePath, source, repo });

console.log(`\nFetching ${filePath} from ${source} on ${repo}...`);
const child = spawn('npx', ['@google/jules-merge', 'get-contents', '--json', payload], { stdio: 'inherit' });
child.on('close', code => process.exit(code || 0));
