import { spawn } from 'child_process';
import fs from 'fs';

const filePath = process.argv[2];
const content = process.argv[3];
const parentsStr = process.argv[4];

if (!filePath || !content || !parentsStr) {
  console.error('Usage: node stage-resolution.mjs <file-path> <content-or-file> <parents-comma-separated>');
  process.exit(1);
}

const parents = parentsStr.split(',').map(p => p.trim());
let payloadContent = content;

// If the content is an existing file path, read it
if (fs.existsSync(content)) {
  payloadContent = fs.readFileSync(content, 'utf8');
}

const payload = JSON.stringify({ filePath, parents, content: payloadContent });

console.log(`\nStaging resolution for ${filePath}...`);
const child = spawn('npx', ['@google/jules-merge', 'stage-resolution', '--json', payload], { stdio: 'inherit' });
child.on('close', code => process.exit(code || 0));
