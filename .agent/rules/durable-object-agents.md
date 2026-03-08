# .agent/rules/durable-object-agents.md

## Rules

- **Dynamic Heavy SDKs:** Never statically import large orchestration libraries (like `@openai/agents` or `langchain`) at the top level of a Cloudflare Worker or Durable Object. Always use dynamic `import()` inside the execution method to preserve sub-50ms cold starts.
- **Client Injection over Globals:** When executing an agent run via the OpenAI Agents SDK, ALWAYS inject the `client` explicitly into the `run()` options (e.g., `run(agent, prompt, { client })`). Never rely on global environment variables to implicitly configure the client.
- **Prefix Namespacing:** Always format the model identifier as `${provider}/${model}` immediately prior to passing it into the `OpenAIAgent` constructor to ensure Cloudflare AI Gateway routes it correctly.
