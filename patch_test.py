import re

with open('tests/flows.test.ts', 'r') as f:
    content = f.read()

target = "expect(migrationContent).toContain('CREATE TABLE `gh_management_config`')"
replacement = "expect(migrationContent).toContain('CREATE TABLE IF NOT EXISTS `gh_management_config`')"

content = content.replace(target, replacement)

with open('tests/flows.test.ts', 'w') as f:
    f.write(content)
