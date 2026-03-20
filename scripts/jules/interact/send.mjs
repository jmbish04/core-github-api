import { initJules } from '../utils.mjs';

const sessionId = process.argv[2];
const message = process.argv[3];

if (!sessionId || !message) {
  console.error('Usage: node send.mjs <session-id> "<message>"');
  process.exit(1);
}

try {
  const jules = await initJules();
  const session = jules.session(sessionId);
  
  console.log(`Sending message to session ${sessionId}: "${message}"`);
  
  // Send the message without awaiting a reply directly
  await session.send(message);
  
  console.log('Message sent successfully. Use `monitor_agent_progress.mjs` or `updates.mjs` to see the agent\'s progress.');

} catch (err) {
  console.error('Failed to send message:', err.message);
}
