import { initJules } from '../utils.mjs';

try {
  const jules = await initJules();
  
  const tasks = process.argv.slice(2);
  if (tasks.length === 0) {
    console.error('Usage: node all.mjs "Task 1" "Task 2" "Task 3"');
    process.exit(1);
  }
  
  console.log(`Starting fleet of ${tasks.length} sessions...`);
  
  const sessions = await jules.all(tasks, (task) => ({
    prompt: task,
  }), {
    concurrency: 5,
    stopOnError: false
  });
  
  console.log(`\nCreated ${sessions.length} sessions.`);
  for (const session of sessions) {
    console.log(`- ${session.id}`);
  }

} catch (err) {
  console.error('Failed to batch sessions:', err.message);
}
