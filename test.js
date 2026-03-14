const fs = require('fs');

const content = fs.readFileSync('backend/src/routes/api/frontend/planner/tasks.ts', 'utf8');
console.log(content.match(/crypto\.randomUUID/g));
console.log(content.match(/new Date\(\)\.toISOString/g));
