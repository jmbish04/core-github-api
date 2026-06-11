Here is a comprehensive prompt you can pass directly to Jules to architect and build this system. It incorporates your entire stack, schema requirements, and specific operational constraints for Cloudflare and D1.

---

### Prompt for Jules

```markdown
# Project Objective
Build a full-stack GitHub Starred Repos tracking and management system. The application will ingest GitHub webhooks, process repository data using AI, vectorize documentation for RAG, and provide an interactive frontend for exploration and auditing.

## Tech Stack & Environment
- **Backend:** Cloudflare Workers, Hono (Routing), Drizzle ORM
- **Database/Storage:** Cloudflare D1 (SQL), Cloudflare Vectorize (Embeddings)
- **Frontend:** Astro, React, Shadcn UI (Default Dark Theme)
- **AI Integration:** Cloudflare AI Gateway routing to Gemini (using the `GEMINI_API_KEY` environment variable).

## Database Schema (Drizzle / D1)
Design the following tables in Drizzle. **Critical D1 Constraint:** Cloudflare D1 does not reliably return auto-incremented IDs on insertion. For any inserts requiring the new ID, you must execute the `INSERT` first, and then run a `SELECT` to retrieve the newly created record.

1. **`starred_repo`**
   - `id` (PK, Auto-increment)
   - `repo_owner` (String)
   - `repo_name` (String)
   - `repo_url` (String)
   - `ai_analysis` (Text)
   - `ai_mindmap_config` (JSON)
   - `ai_final_report` (Text)
   - `rag_uuid` (String, links to Vectorize)
   - `isActive` (Boolean/Integer, default 1)
   - `date_inactive` (Timestamp, nullable)

2. **`github_stars` (Star Lists/Categories)**
   - `id` (PK, Auto-increment)
   - `name` (String)
   - `description` (String, nullable)
   - `isActive` (Boolean/Integer, default 1)
   - `date_inactive` (Timestamp, nullable)
   - `fk_replacing_star` (Integer, nullable, points to the new `github_stars.id` if renamed/merged)

3. **`starred_repo_map`**
   - `id` (PK, Auto-increment)
   - `repo_id` (FK to `starred_repo`)
   - `star_id` (FK to `github_stars`)
   - `date_starred` (Timestamp)
   - `date_unstarred` (Timestamp, nullable)
   - `isActive` (Boolean/Integer, default 1)
   - `reason_inactive` (Enum/String: 'merged', 'star_fk_record_revision', 'unstarred')

4. **`starred_repo_tag`**
   - `id` (PK, Auto-increment)
   - `name` (String)
   - `description` (String)
   - `color` (String)

5. **`starred_repo_tag_map`**
   - `tag_id` (FK to `starred_repo_tag`)
   - `repo_id` (FK to `starred_repo`)

## Backend: Webhooks & Background Processing
1. **GitHub Webhooks Endpoint:** Create a Hono route to receive GitHub star/repo events.
2. **Event Handling Pipeline:**
   - **Star Added/Created:** Insert records.
   - **Unstar:** Update `starred_repo` and `starred_repo_map` setting `isActive = 0` and `date_inactive = now()`.
   - **Star List Renamed/Changed:** Create a *new* `github_stars` record. Mark the old one `isActive = false` and set `fk_replacing_star` to the new ID. Copy all active `starred_repo_map` records to point to the new star ID, marking the old mappings as `isActive = false` with `reason_inactive = 'star_fk_record_revision'`.
3. **AI Processing (Background Task / Queue):**
   - When a new repo is starred, trigger an AI analysis pipeline.
   - Prompt the AI to analyze the repo specifically for a Senior Engineer who builds self-healing systems on Cloudflare Workers, uses a Mac, employs a "vibe coding" methodology with AI agents, manages a Home Assistant/UniFi lab, and builds UIs with React/Shadcn. 
   - The AI must generate: 
     1. An AI description.
     2. A personal use-case analysis based on the persona above.
     3. Tags (to populate the tag tables).
     4. A Mind Map configuration payload formatted for the `mindmapcn` API (https://mindmapcn.vercel.app/docs/api-reference).
   - Fetch the repo's README, vectorize it, store the embeddings in Cloudflare Vectorize, and save the corresponding RAG ID to `rag_uuid`.

## Frontend: Architecture & UI (React + Shadcn)
1. **Main Landing Page:**
   - **Unread/New Repos Section:** Highlight newly tagged/analyzed repos at the very top. Clear this state once the user clicks/views the report.
   - **Grouped List:** Fetch and group repos by Star Name. Render them as Shadcn `Accordion` or collapsible sections.
   - **Rows:** Each row should display the Repo Title, Description, and generated Shadcn `Badge` components for the tags.
2. **Starred Repos Viewport:**
   - Clicking a star name routes to a detailed viewport for that specific list.
   - Clicking a repo row opens a Shadcn `Sheet` (Side Panel).
   - **Sidebar Content:** Link to the GitHub repo, the personalized AI analysis, the mindmap visualization, and a close button. Clicking different repos seamlessly updates this open sidebar.
3. **Audit Workspace:**
   - Build an interface to audit star lists (due to GitHub's list limits).
   - Integrate a chat/prompt interface where the AI assistant analyzes all current star lists, identifies duplicates/overlaps, and proposes a cleanup/merge plan.
   - The user can iterate on this plan via chat and click an "Approve & Execute" button to trigger the merge logic in the database and sync back to GitHub.

## Output Requirements
ALWAYS RESPOND WITH FULL END-TO-END CODE. Every line of the provided modules must be present and correct. Target OpenAPI v3.1.0 and ensure `/health` endpoints are included. Do not skip code using comments like `// rest of code here`.

```

---

### Antigravity Implementation Plan

**Target File:** `.agent/workflows/implement-feature.md`

```markdown
# Workflow: Implement GitHub Starred Repo Tracker

## Phase 1: Database & Schema
1. Review D1 constraints. 
2. Create Drizzle schema for `starred_repo`, `github_stars`, `starred_repo_map`, `starred_repo_tag`, and `starred_repo_tag_map`.
3. Generate and apply D1 migrations. Ensure package.json includes `migrate:db`.

## Phase 2: Core Hono API & Webhooks
1. Implement GitHub webhook listener in Hono.
2. Build CRUD operations for repos and stars. 
3. Implement the SCD (Slowly Changing Dimension) logic for star record replacement and cascade mapping updates. Remember: Insert records first, then run a `SELECT` to get the generated ID.

## Phase 3: AI Processing Pipeline
1. Integrate Gemini via Cloudflare AI Gateway using `GEMINI_API_KEY`.
2. Write the extraction prompts utilizing the specific user persona (Vibe coder, Mac, Cloudflare stack, Home Assistant).
3. Implement the Vectorize ingestion pipeline for README RAG.

## Phase 4: Frontend UI (Astro/React/Shadcn)
1. Build the main landing page with Shadcn Accordions for grouped stars.
2. Implement the sliding `Sheet` component for the repository sidebar details.
3. Build the AI Audit dashboard for interacting with the AI to merge/clean up star lists.

```

**Target File:** `.agent/rules/star-tracker-rules.md`
*(Note to Jules: Review existing `.agent/rules/` directory first, then merge/update existing rule files with this content)*

```markdown
# Star Tracker Specific Rules

1. **D1 Auto-Increment Handling:** Never assume D1 returns the auto-incremented ID correctly on an `INSERT...RETURNING` call. Always execute the `INSERT` statement completely, and then execute a subsequent `SELECT` query using deterministic fields to fetch the newly created record ID.
2. **AI Gateway & Keys:** All Gemini AI calls must route through the Cloudflare AI Gateway. Ensure authentication uses the `GEMINI_API_KEY` environment variable specifically.
3. **UI Fidelity:** All frontend components must utilize the Shadcn Dark Theme. The sidebar implementation must use the Shadcn `Sheet` component to ensure overlay consistency.

```
