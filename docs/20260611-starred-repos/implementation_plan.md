# Implementation Plan: GitHub Starred Repos Tracker

## 1. Architecture & Stack
- **Compute/Routing:** Cloudflare Workers + Hono (OpenAPI v3.1.0 strict)
- **Frontend:** Astro (SSR) + React Islands + Shadcn UI (Default Dark Theme)
- **Data Layer:** Drizzle ORM + Cloudflare D1
- **Vector Storage:** Cloudflare Vectorize (for RAG on READMEs)
- **AI/Logic:** Cloudflare Agents SDK + AI Gateway (using `GEMINI_API_KEY`)

## 2. Database Schema (Drizzle/D1)
*Migrations must live in `./drizzle` and a `migrate:db` script must be added to `package.json`.*

- `starred_repo`: id, repo_owner, repo_name, repo_url, ai_analysis, ai_mindmap_config, ai_final_report, rag_uuid, isActive, date_inactive
- `github_stars`: id, name, description, isActive, date_inactive, fk_replacing_star
- `starred_repo_map`: id, repo_id, star_id, date_starred, date_unstarred, isActive, reason_inactive (enum)
- `starred_repo_tag`: id, name, description, color
- `starred_repo_tag_map`: tag_id, repo_id

## 3. Webhook Pipeline & Background Processing
- **Ingestion:** Hono must expose a validated webhook endpoint for GitHub payload ingestion.
- **SCD (Slowly Changing Dimensions) Logic:** - If a star list is renamed/altered, create a NEW `github_stars` record.
  - Set the old record `isActive = false` with `fk_replacing_star` pointing to the new ID.
  - Cascade update `starred_repo_map` to point to the new star ID, marking old maps inactive.
- **AI Processing Queue:**
  - Newly starred repos trigger an asynchronous workflow.
  - Generate AI description, tags, mindmap config, and use-case analysis.
  - Fetch repo README, vectorize, store in Vectorize, and map to `rag_uuid`.

## 4. Frontend Requirements (Astro + Shadcn)
- **Main Landing Page:** - Group repos by Star Name using Shadcn `Accordion`.
  - Highlight newly tagged/analyzed repos at the top (clear state on view).
  - Row items display: Title, Description, and Shadcn `Badge` tags.
- **Viewport & Sheet:**
  - Clicking a repo row opens a Shadcn `Sheet` (Side Panel).
  - Must display AI analysis, mindmap, and dynamic content. Sidebar must stay open and update reactively if the user clicks a different repo in the background.
- **Audit Workspace:**
  - Interactive AI chat interface to review, merge, and clean up duplicate GitHub star lists.
