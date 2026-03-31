import { initJules } from '../utils.mjs';

const sessionId = process.argv[2];

if (!sessionId) {
  console.error('Usage: node artifacts.mjs <session-id>');
  process.exit(1);
}

try {
  const jules = await initJules();
  const session = jules.session(sessionId);
  
  console.log(`Fetching artifacts for session ${sessionId}...`);
  
  for await (const activity of session.history()) {
    if (activity.artifacts?.length) {
      console.log(`\nFound ${activity.artifacts.length} artifacts in activity [${activity.type}]`);
      
      for (const artifact of activity.artifacts) {
        if (artifact.type === 'bashOutput') {
          console.log(`- Bash Output:\n${artifact.toString()}`);
        } else if (artifact.type === 'changeSet') {
          const parsed = artifact.parsed();
          console.log(`- ChangeSet (${parsed.files.length} files modified)`);
          for (const file of parsed.files) {
            console.log(`    ${file.path}: +${file.additions} -${file.deletions}`);
          }
        } else if (artifact.type === 'media') {
          console.log(`- Media: ${artifact.format}`);
          // e.g. await artifact.save(`./${activity.id}_${Date.now()}.png`);
        } else {
          console.log(`- Unknown artifact type: ${artifact.type}`);
        }
      }
    }
  }

} catch (err) {
  console.error('Failed parsing artifacts:', err.message);
}
