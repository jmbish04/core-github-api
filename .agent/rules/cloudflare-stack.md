# Cloudflare & Stack Standards

- **Routing:** Hono strictly typed with `@hono/zod-openapi` targeting OpenAPI v3.1.0.
- **Data:** Drizzle ORM mapping to D1 SQLite. Complex nested arrays MUST use `text('col', { mode: 'json' }).$type<StrictInterface[]>()`.
- **AI Execution:** Use `@google/genai` utilizing the `GEMINI_API_KEY` and the provided environment model name. Route base URLs through `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/google-genai`.
- **UI Styling:** React + Shadcn UI. Enforce Dark Theme default (`bg-slate-950`).
- **Code Completeness:** Never truncate files. Generate full end-to-end code during every update pass.
