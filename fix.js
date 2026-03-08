const fs = require('fs');

const content = fs.readFileSync('backend/src/index.ts', 'utf8');

// Update imports
let newContent = content.replace(
  'import type research from "@/routes/api/frontend/research/research";',
  'import type research from "@/routes/api/frontend/research/research";\nimport frontendToolsApi from "@/routes/api/frontend/tools";'
);

// Update eagerApi
newContent = newContent.replace(
  ".route('/projects', projectsApi)",
  ".route('/projects', projectsApi)\n  .route('/tools', frontendToolsApi)"
);

// We won't try to type it lazily or anything crazy, eagerApi infers its own type and exports it.
// wait, the app is typed via `export type AppType = typeof eagerApi & ...`
// We added it to eagerApi directly, so it's already in the type!

fs.writeFileSync('backend/src/index.ts', newContent);
