import { initJules } from '../utils.mjs';

const githubRepo = process.argv[2];
const baseBranch = process.argv[3];
const autoPr = process.argv[4] === 'true';
const promptText = process.argv.slice(5).join(' ');

if (!githubRepo || !baseBranch || !promptText) {
  console.error('Usage: node session.mjs <github-repo> <base-branch> <auto-pr: true|false> <prompt...>');
  process.exit(1);
}

try {
  const jules = await initJules();
  
  console.log(`\nCreating connected session for ${githubRepo}@${baseBranch}...`);
  const session = await jules.session({
    prompt: promptText,
    source: { github: githubRepo, baseBranch: baseBranch },
    autoPr: autoPr
  });
  
  console.log(`\n✅ Session created successfully!`);
  console.log(`Session ID: ${session.id}`);
  console.log(`(Copy this Session ID to interact with it from the main menu)`);
  
} catch (err) {
  console.error('\nFailed to create session:', err.message);
}
