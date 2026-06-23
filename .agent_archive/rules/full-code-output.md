---
trigger: always_on
---

# Rule: Full-Code Output Only

## Core Requirement
- When generating, rewriting, or reviewing code, always return complete, ready-to-use code for every file or function you touch.
- If a file is in scope, return the full file content for that file.
- If a function is rewritten, return the full rewritten function.

## Forbidden Output
Do not use placeholders, elisions, or shorthand such as:

- `// ... rest of the function remains the same ...`
- `// leaving as is`
- `// ... rest of code ...`
- `# existing code omitted`
- `/* unchanged */`

## Required Behavior
- Do not replace omitted code with commentary.
- Do not describe skipped sections in prose.
- Either provide the complete code for the touched file or leave the file out of the response entirely.
- When returning structured outputs that contain code fields, those fields must contain the full final code, not a partial patch summary.

## Applies To
- onboarding agents
- repository specialist agents
- coding assistants
- slash-command agents
- planning/codegen helpers
- documentation agents when they emit code examples
