const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('src/backend/src/ai/agents', (filePath) => {
  if (!filePath.endsWith('.ts')) return;

  let content = fs.readFileSync(filePath, 'utf-8');
  let originalContent = content;

  // Replace `import { AgentStateStore } from ...` and variations
  // By matching things like: `import { AgentStateStore } from '@/ai/providers';`
  // And `import { AgentStateStore, buildToolInstructions } from ...`
  // Since regex can be tricky with multiline imports, let's use a simple global regex:
  // Remove `AgentStateStore` and `buildToolInstructions` from named imports of `@/ai/providers`
  
  // First, find all imports from '@/ai/providers'
  const importRegex = /import\s+({[^}]+})\s+from\s+['"]@\/ai\/providers['"];/g;
  content = content.replace(importRegex, (match, importsBody) => {
    let updatedBody = importsBody
      .replace(/\bAgentStateStore\b,?\s*/g, '')
      .replace(/\bbuildToolInstructions\b,?\s*/g, '')
      .trim();
      
    // Remove trailing/leading commas or empty imports
    updatedBody = updatedBody.replace(/^,\s*/, '').replace(/,\s*$/, '').replace(/,\s*,/g, ',');
    
    if (updatedBody === '{}') {
      return '';
    }
    return `import ${updatedBody} from '@/ai/providers';`;
  });

  // Also replace individual imports if they got missed (e.g. they were the only import)
  content = content.replace(/import\s+{\s*}\s*from\s*['"]@\/ai\/providers['"];?\n?/g, '');

  // 2. Replace instances
  content = content.replace(/new AgentStateStore</g, 'new this.ai.AgentStateStore<');
  content = content.replace(/buildToolInstructions\(/g, 'this.ai.buildToolInstructions(');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('Updated: ' + filePath);
  }
});

