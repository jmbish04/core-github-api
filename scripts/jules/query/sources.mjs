import { initJules } from '../utils.mjs';

try {
  const jules = await initJules();
  
  console.log('Fetching connected sources...\n');
  
  for await (const source of jules.sources()) {
    if (source.type === 'githubRepo') {
      console.log(`GitHub Repository: ${source.githubRepo.owner}/${source.githubRepo.repo}`);
      console.log(`ID: ${source.id}`);
      console.log(`Private: ${source.githubRepo.isPrivate}`);
      console.log('---');
    }
  }

} catch (err) {
  console.error('Failed to List sources:', err.message);
}
