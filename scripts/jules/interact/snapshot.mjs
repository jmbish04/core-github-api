import { initJules } from '../utils.mjs';

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('Usage: node snapshot.mjs <session-id>');
  process.exit(1);
}

try {
  const jules = await initJules();
  const session = jules.session(sessionId);
  
  console.log('Generating session snapshot for:', sessionId);
  console.log('Loading activities... this may take a moment.\n');
  
  const snapshot = await session.snapshot({ activities: true });
  console.log(snapshot.toMarkdown());

} catch (err) {
  console.error('Failed to get session snapshot:', err.message);
}
