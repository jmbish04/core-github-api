const fs = require('fs');
let content = fs.readFileSync('backend/src/index.ts', 'utf8');

// I also need to add it to eagerApi so it gets the types.
content = content.replace(
  "  .route('/projects', projectsApi)",
  "  .route('/projects', projectsApi)\n  .route('/tools', frontendToolsApi)"
);

fs.writeFileSync('backend/src/index.ts', content);
