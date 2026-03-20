import { initJules } from '../utils.mjs';

const sessionId = process.argv[2];

if (!sessionId) {
  console.error('Usage: node updates.mjs <session-id>');
  process.exit(1);
}

try {
  const jules = await initJules();
  const session = jules.session(sessionId);
  
  console.log(`Listening for live activities on session ${sessionId}...\n(Press Ctrl+C to stop)`);
  
  for await (const activity of session.updates()) {
    console.log(`[${activity.type}]`);
    if (activity.title) console.log(`  ${activity.title}`);
    if (activity.message) console.log(`  Agent: ${activity.message}`);
  }

} catch (err) {
  console.error('Failed streaming updates:', err.message);
}
