import { initJules } from '../utils.mjs';

const sessionId = process.argv[2];
const targetState = process.argv[3] || 'awaitingPlanApproval';

if (!sessionId) {
  console.error('Usage: node waitFor.mjs <session-id> [target-state]');
  process.exit(1);
}

try {
  const jules = await initJules();
  const session = jules.session(sessionId);
  
  console.log(`Waiting for session ${sessionId} to reach state: '${targetState}'...\n(Press Ctrl+C to cancel)`);
  
  await session.waitFor(targetState);
  
  console.log(`\nSession has reached state: ${targetState}!`);

} catch (err) {
  console.error(`Failed waiting for state ${targetState}:`, err.message);
}
