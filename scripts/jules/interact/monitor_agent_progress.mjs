import { initJules } from '../utils.mjs';

const jules = await initJules();

// Retrieve the session ID from command-line arguments
const sessionId = process.argv[2];

if (!sessionId) {
  console.error('Error: Please provide a session ID as an argument.');
  console.error('Usage: node script.mjs <session-id>');
  process.exit(1);
}

const session = jules.session(sessionId);

for await (const activity of session.stream()) {
  switch (activity.type) {
    case 'planGenerated':
      console.log(`${activity.plan.steps.length} steps.`);
      break;
    case 'agentMessaged':
      console.log(`\n--- [AGENT MESSAGE] ---`);
      console.log(activity.message);
      console.log(`-----------------------\n`);
      break;
    case 'progressUpdated':
      console.log(`${activity.title}`);
      // Check for code updates
      for (const artifact of activity.artifacts) {
        if (artifact.type === 'changeSet') {
          const parsed = artifact.parsed();
          for (const file of parsed.files) {
            console.log(`${file.path}: +${file.additions} -${file.deletions}`);
          }
        }
      }
      break;
    case 'sessionCompleted':
      console.log('Session finished successfully.');
      break;
  }
}

// Get the pull-request URL once complete
const outcome = await session.result();
if (outcome.pullRequest) {
  console.log(`PR: ${outcome.pullRequest.url}`);
}