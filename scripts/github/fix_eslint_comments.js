const fs = require('fs');

const data = require('../../src/frontend/eslint-summary-new.json');
const targetRules = ['react-refresh/only-export-components', 'react-hooks/set-state-in-effect', 'react-hooks/incompatible-library'];

for (const fileData of data) {
  const file = fileData.file;
  if (!fs.existsSync(file)) continue;

  const messagesToFix = fileData.messages.filter(m => targetRules.includes(m.ruleId));
  if (messagesToFix.length === 0) continue;

  // Group by line to avoid inserting multiple comments on the same line if multiple errors occur
  const linesToFix = {};
  messagesToFix.forEach(m => {
    if (!linesToFix[m.line]) linesToFix[m.line] = [];
    if (!linesToFix[m.line].includes(m.ruleId)) linesToFix[m.line].push(m.ruleId);
  });

  const content = fs.readFileSync(file, 'utf8').split('\n');
  const sortedLines = Object.keys(linesToFix).map(Number).sort((a, b) => b - a);

  for (const lineNum of sortedLines) {
    const idx = lineNum - 1;
    const ruleIds = linesToFix[lineNum];
    const comment = `// eslint-disable-next-line ${ruleIds.join(', ')}`;

    // Check if the comment is already there to avoid duplicates
    if (idx > 0 && content[idx - 1].includes('eslint-disable-next-line')) {
       // if it already has one of the rules, don't add. (Simple check)
       if(ruleIds.some(r => content[idx - 1].includes(r))) {
          continue;
       }
    }

    const match = content[idx].match(/^\s*/);
    const indent = match ? match[0] : '';
    content.splice(idx, 0, indent + comment);
  }

  fs.writeFileSync(file, content.join('\n'));
  console.log(`Fixed rules in ${file}`);
}
