import { initJules } from '../utils.mjs';

const sessionId = process.argv[2];

if (!sessionId) {
  console.error('Usage: node history.mjs <session-id>');
  process.exit(1);
}

try {
  const jules = await initJules();
  const session = jules.session(sessionId);
  
  console.log(`Replaying cached activities for session ${sessionId}...\n`);
  
  for await (const activity of session.history()) {
    console.log(`[${new Date(activity.createTime).toLocaleTimeString()}] ${activity.type}`);
    if (activity.title) console.log(`  Title: ${activity.title}`);
    if (activity.message) console.log(`  Agent: ${activity.message}`);
  }
  
  console.log('\n--- End of History ---');

} catch (err) {
  console.error('Failed to fetch history:', err.message);
}
