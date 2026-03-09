const fs = require('fs');
let file = fs.readFileSync('tests/flows.test.ts', 'utf8');
file = file.replace(/expect\(migrationContent\)\.toContain\('CREATE TABLE `gh_management_config`'\)/, "expect(migrationContent).toContain('CREATE TABLE IF NOT EXISTS `gh_management_config`')");
fs.writeFileSync('tests/flows.test.ts', file);
