
## 💡 `prompt.md`


# 🧠 AI Builder Prompt — Cloudflare Worker GitHub Proxy (`core-github-api`)

**Goal:**  
Develop a modular, extensible Cloudflare Worker that proxies all GitHub REST and GraphQL endpoints, exposes validated Hono routes, and dynamically generates OpenAPI specs for agent discovery.

---

## 1️⃣ Core Objectives

- Implement **Hono** + **@hono/zod-openapi** for routing + schema-driven validation  
- Use **Octokit** clients for REST and GraphQL operations  
- Generate `/openapi.json` and `/openapi.yaml` dynamically  
- Structure the code to be **agent-friendly**, **modular**, and **self-documenting**  
- Provide end-to-end testable routes for:
  - `/api/octokit/rest/...`
  - `/api/octokit/graphql/...`
  - `/api/tools/files/...`
  - `/api/tools/prs/...`

---

## 2️⃣ Folder Structure

````

/src
/octokit
core.ts
/rest
repos.ts
contents.ts
issues.ts
pulls.ts
/graphql
graphql.ts
index.ts
/tools
files.ts
prs.ts
issues.ts
/utils
base64.ts
paginate.ts
etagCache.ts
rateLimit.ts
hono.ts
index.ts
/docs
AGENTS.md
prompt.md
wrangler.toml
README.md
package.json

````

---

## 3️⃣ Build Requirements

- ✅ TypeScript + ESM modules  
- ✅ Hono framework  
- ✅ @hono/zod-openapi for schema validation  
- ✅ @octokit/rest & @octokit/graphql for GitHub API  
- ✅ Zod for runtime safety  
- ✅ `wrangler.toml` configured for Cloudflare deployment  

---

## 4️⃣ Functional Highlights

- Proxy GitHub REST calls under `/api/octokit/rest/:namespace/:method`
- Proxy GitHub GraphQL calls under `/api/octokit/graphql`
- Abstract common workflows (files, PRs, issues) under `/api/tools/...`
- Implement base64-safe file upsert logic (`mode: text|binary|auto`)
- Add ETag KV caching and rate-limit retry handling
- Log every inbound and outbound call with structured metadata

---

## 5️⃣ OpenAPI Integration

Use `@hono/zod-openapi` to:

- Derive OpenAPI specs from Zod schemas  
- Serve `/openapi.json` (JSON) and `/openapi.yaml` (YAML)  
- Attach examples and endpoint descriptions  
- Mark `/api/tools/*` endpoints with `x-agent: true` metadata for GPT discovery

---

## 6️⃣ Logging & Observability

Every route should log:

```ts
console.log("[route]", method, path, { status, latency, payloadSize });
````

* Add correlation IDs where possible
* Include timestamps and request origins
* Keep logs JSON-friendly for vector search ingestion later

---

## 7️⃣ Documentation Requirements

Each file must contain:

1. File-level docstring (purpose, inputs/outputs, ownership)
2. Inline comments for complex logic
3. “Extension point” comment at bottom for future AI coders

---

## 8️⃣ Agent Workflows

Agents must support:

* **Create/Update files** via `/api/tools/files/upsert`
* **Open PRs** via `/api/tools/prs/open`
* **Extend functionality** by pushing new REST or GraphQL handlers

---

## 9️⃣ Output Specification

Deliver a **ready-to-deploy zip** containing:

* `/src` fully implemented
* `/docs` including AGENTS.md + prompt.md
* `/openapi.json` + `/openapi.yaml` endpoints active
* `README.md` summarizing usage
* `package.json` with dependencies:

  ```json
  {
    "dependencies": {
      "hono": "^4.0.0",
      "@hono/zod-openapi": "^0.9.0",
      "zod": "^3.23.0",
      "@octokit/rest": "^20.0.0",
      "@octokit/graphql": "^7.0.0"
    },
    "devDependencies": {
      "typescript": "^5.6.0",
      "wrangler": "^3.60.0"
    }
  }
  ```

---

## 🔟 Testing Criteria

* `wrangler dev` should start without errors
* `/healthz` returns `{ ok: true }`
* `/api/tools/files/upsert` correctly encodes text to base64 once
* `/openapi.json` reflects all endpoints and Zod schema metadata

---

## 1️⃣1️⃣ Deployment Checklist

* Run `wrangler publish`
* Verify API endpoints and `/openapi.*` docs
* Store your GitHub token securely with:

  ```
  wrangler secret put GITHUB_TOKEN
  ```




