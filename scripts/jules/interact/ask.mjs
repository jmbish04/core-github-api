import { initJules } from '../utils.mjs';

const sessionId = process.argv[2];
const message = process.argv.slice(3).join(' ');

if (!sessionId) {
  console.error('Usage: node ask.mjs <session-id> <message>');
  process.exit(1);
}

if (!message || message.trim() === '') {
  console.log('Message cannot be empty. Aborting.');
  process.exit(1);
}

try {
  const jules = await initJules();
  const session = jules.session(sessionId);
  
  console.log('\nSending message to agent... (Waiting for reply)');
  const reply = await session.ask(message);
  console.log(`\n[AGENT REPLY]`);
  console.log('--------------------------------------------------');
  console.log(reply.message);
  console.log('--------------------------------------------------');

} catch (err) {
  console.error('Failed to send message:', err.message);
}
