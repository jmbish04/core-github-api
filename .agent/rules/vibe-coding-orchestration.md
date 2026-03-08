# Vibe Coding Orchestration Rules

1. **Framework Strictness**: All new agents coordinating the vibe process MUST use the `honidev` framework. Do not use legacy Vercel AI SDK abstractions for agent state.
2. **Rule Injection Guarantee**: The dispatcher must never bypass rule injection. Every call to the `jules` service must contain the concatenated text of all files in `.agent/rules/`.
3. **No File System at Runtime**: Do not use `node:fs` or `node:fs/promises` to read rule files. Use Wrangler's text module globs to bundle markdown files into the worker at build time.
4. **Oversight Mandate**: The `JulesOverseer` must validate code against the injected rules before any automated GitHub PR merge is triggered.
