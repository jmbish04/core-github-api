import { spawn } from 'child_process';
const child = spawn('npx', ['@google/jules-merge', 'status'], { stdio: 'inherit' });
child.on('close', code => process.exit(code || 0));
