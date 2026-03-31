import { initJules } from '../utils.mjs';

try {
  const jules = await initJules();
  const prompt = process.argv[2] || 'Write a hello world script in Python.';
  
  console.log('Running automated session with prompt:', prompt);
  
  const session = await jules.run({
    prompt,
  });
  
  const result = await session.result();
  
  console.log('\n--- Session Complete ---');
  console.log(`Outcome state: ${result.state}`);
  
  const generatedFiles = result.generatedFiles();
  if (generatedFiles && generatedFiles.size > 0) {
    console.log(`\nGenerated ${generatedFiles.size} files:`);
    for (const [filepath, fileData] of generatedFiles.entries()) {
      console.log(`- ${filepath} (${fileData.content?.length || 0} chars)`);
    }
  }

} catch (err) {
  console.error('Failed to run automated session:', err.message);
}
