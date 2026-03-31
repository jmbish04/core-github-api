import re
with open("tests/flows.test.ts", "r") as f:
    content = f.read()

content = content.replace("expect(migrationContent).toContain('CREATE TABLE `gh_management_config`')", "expect(migrationContent).toContain('CREATE TABLE IF NOT EXISTS `gh_management_config`')")

with open("tests/flows.test.ts", "w") as f:
    f.write(content)
