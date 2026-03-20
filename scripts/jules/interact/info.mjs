import { initJules } from '../utils.mjs';

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('Usage: node info.mjs <session-id>');
  process.exit(1);
}

try {
  const jules = await initJules();
  const session = jules.session(sessionId);
  
  console.log('Fetching session info for:', sessionId);
  const info = await session.info();
  console.log('\n--- Session Info ---');
  console.log(`Title: ${info.title || 'N/A'}`);
  console.log(`State: ${info.state}`);
  console.log(`Created: ${new Date(info.createTime).toLocaleString()}`);
  
  // If the session has completed, fetch final result
  if (['completed', 'failed', 'canceled'].includes(info.state)) {
    console.log('\n--- Final Result ---');
    const result = await session.result();
    if (result.pullRequest) {
      console.log(`Pull Request URL: ${result.pullRequest.url}`);
    } else {
      console.log(`Outcome state: ${result.state}`);
    }
  }

} catch (err) {
  console.error('Failed to get session info:', err.message);
}
