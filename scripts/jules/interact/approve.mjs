import { initJules } from '../utils.mjs';

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('Usage: node approve.mjs <session-id>');
  process.exit(1);
}

try {
  const jules = await initJules();
  const session = jules.session(sessionId);
  
  console.log('Attempting to approve pending plan for session:', sessionId);
  
  await session.approve();
  console.log('Plan successfully approved!');

} catch (err) {
  console.error('Failed to approve plan. Is the session actually waiting for approval?', err.message);
}
