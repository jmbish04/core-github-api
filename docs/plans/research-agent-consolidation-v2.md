# Consolidating ResearchAgent into Multi-Source Intelligence Hub

## Objective

Transform `ResearchAgent` into the system's centralized intelligence collector:
1. **Multi-source polling** (RSS, GitHub, Discord, Web) on configurable schedules
2. **HITL-integrated proposals** — surfacing discoveries to standardization repo, GoldenPaths, GuardrailAgent, or agent skills, with multi-agent deliberation
3. **Newsletter dispatch** — daily/weekly digests including discoveries AND pending HITL items with frontend deep-links

---

## 1. Legacy Table Audit

### `cloudflare_changelog` — 3 consumers → MIGRATE

| Consumer | File | Action |
|----------|------|--------|
| `CloudflareChangelogWorkflow` | `workflows/research/cloudflare-changelog.ts` | **MIGRATE** → write to `tracked_items` |
| `sendRepoDiscoveryEmail` | `utils/email/send/repo-discovery.ts` L82-108 | **MIGRATE** → query `tracked_items WHERE source.type='rss'` |
| `dailyResearchIngestHandler` | `routes/api/frontend/research/daily/ingest.ts` L39 | **KEEP** — just spawns workflow |

### `newsletter_repos` — 1 consumer → MIGRATE

| Consumer | File | Action |
|----------|------|--------|
| `research-orchestration.ts` `/check-deduplication` | `routes/api/agents/research-orchestration.ts` L49-51 | **MIGRATE** → query `tracked_items WHERE source.type='github_search'` |

Both tables become rows in the new generalized `tracked_sources` + `tracked_items` schema.

---

## 2. Schema Layer

### [NEW] `src/backend/src/db/schemas/agents/research-tracking.ts`

**`tracked_sources`** — what ResearchAgent monitors

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | UUID |
| `type` | text | `'rss' \| 'discord' \| 'github_search' \| 'web_search'` |
| `query_or_url` | text | RSS URL or search query |
| `name` | text | Human label |
| `frequency` | text | `'hourly' \| 'daily' \| 'weekly'` |
| `is_active` | integer(boolean) | Pause toggle |
| `last_checked_at` | text | Last poll timestamp |

**`tracked_items`** — discoveries from any source

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | UUID or URL hash |
| `source_id` | text FK | → `tracked_sources.id` |
| `title` | text | Entry title |
| `url` | text UNIQUE | Canonical URL |
| `content` | text | Raw description |
| `ai_summary` | text | AI 1-sentence summary |
| `published_at` | text | Original pub date |
| `emailed` | integer(boolean) | Included in newsletter |
| `hitl_queued` | integer(boolean) | Proposed to HITL |
| `hitl_record_id` | text | FK → `hitl_queue.id` |
| `processed_by_learning_agent` | integer(boolean) | LearningAgent reviewed |

### [MODIFY] `db/schemas/agents/index.ts` — add barrel export

---

## 3. Delete DiscordResearchAgent

### [DELETE] `ResearchAgent/methods/discord/DiscordResearch.ts`

`searchDiscordMessages` and `triggerDiscordResearchWorkflow` already exist in `discord/index.ts` and are wired via `@callable()`.

---

## 4. New ResearchAgent Methods

### [NEW] `methods/rss.ts` — `pollRSSFeed(agent, source)`
- `fast-xml-parser` (already in package.json) to fetch + parse
- Dedup by URL against `tracked_items`
- AI-summarize via `agent.ai.generateText()`
- Bulk-insert + update `last_checked_at`

### [NEW] `methods/polling.ts` — `pollTrackedSources(agent)`
- Queries active sources past their frequency threshold
- Dispatches: `rss` → `pollRSSFeed()`, `github_search` → `searchGithub()`, `discord` → `searchDiscordMessages()`, `web_search` → `executeWebSearch()`
- Persists results to `tracked_items`
- Runs HITL proposal logic on each new item

### [NEW] `methods/newsletter.ts` — `dispatchNewsletter(agent, mode)`

**Leverages existing infra:**
- `sendRepoDiscoveryEmail()` — Handlebars + `SEND_EMAIL_NEWSLETTER` binding
- `EmailTemplaterService` — MIME via `mimetext`
- `generateResearchReport()` — markdown report generation

**Newsletter sections:**
1. **New Discoveries** — unemailed `tracked_items`, grouped by source type
2. **Pending HITL Items** — `hitl_queue WHERE category='research_proposal' AND status='pending'`, each with deep-link to `/hitl/research-proposals/{id}`
3. **Cloudflare Highlights** — RSS items from CF feeds with stack-relevance filter

### [NEW] `methods/propose-hitl.ts` — `proposeTrackedItemToHitl(agent, item, context)`

Flow:
1. ResearchAgent AI evaluates: "Is this actionable for standardization repo, golden paths, guardrail rules, or agent skills?"
2. If yes → `HitlQueue.propose()` with `category: 'research_proposal'`
3. Updates `tracked_items.hitl_queued = true`
4. Newsletter includes pending items with frontend links

---

## 5. Multi-Agent HITL Deliberation Thread

When a HITL item is viewed in the frontend, `requestDeliberation()` fans out to peer agents:

| Agent | Binding | Contribution |
|-------|---------|-------------|
| **ResearchAgent** | self | Original context, source material, similar findings |
| **LearningAgent** | `LEARNING_AGENT` | Pattern correlation from `fleet_observations`, recurrence analysis |
| **CloudflareAgent** | `CLOUDFLARE_AGENT` | Cloudflare docs MCP lookup for current best practices |
| **GuardrailAgent** | `GUARDRAIL_AGENT` | Checks for conflicts/duplicates with existing golden path rules |

Responses appended to `contextMetadata.deliberation[]` on the HITL record.

### Post-Approval → LearningAgent Follow-Up

When approved:
1. `LearningAgent.dispatchApprovedAction()` receives the record
2. LearningAgent creates a **follow-up HITL item** drilling down into:
   - Exact files to modify in standardization repo
   - Golden path config rows to create/update (`goldenPathConfig` table)
   - New guardrail rule definitions
   - New agent skill entries (`agent_skills` D1 table)
   - Or "all of the above" with phased plan
3. Follow-up goes through its own review cycle

---

## 6. ResearchAgent Index Wiring

### [MODIFY] `ResearchAgent/index.ts`

Add peer bindings + callables:
```typescript
peerAgentBindings: {
  LEARNING_AGENT, CLOUDFLARE_AGENT, GUARDRAIL_AGENT
}

@callable() pollSources()
@callable() sendNewsletter(mode)
@callable() proposeToHitl(itemId, target)
@callable() requestDeliberation(hitlRecordId)
```

### [MODIFY] `methods/index.ts` — add barrel exports
### [MODIFY] `types.ts` — add TrackedSourceType, PollResult, NewsletterResult

---

## 7. Migrate Existing Services

| File | Change |
|------|--------|
| `cloudflare-changelog.ts` workflow | Persist step → `tracked_items` |
| `repo-discovery.ts` email | CF changelog query → `tracked_items WHERE type='rss'` |
| `research-orchestration.ts` dedup | `newsletter_repos` → `tracked_items WHERE type='github_search'` |

---

## Files Summary

| Action | File |
|--------|------|
| **NEW** | `db/schemas/agents/research-tracking.ts` |
| **NEW** | `ResearchAgent/methods/rss.ts` |
| **NEW** | `ResearchAgent/methods/polling.ts` |
| **NEW** | `ResearchAgent/methods/newsletter.ts` |
| **NEW** | `ResearchAgent/methods/propose-hitl.ts` |
| **DELETE** | `ResearchAgent/methods/discord/DiscordResearch.ts` |
| **MODIFY** | `db/schemas/agents/index.ts` |
| **MODIFY** | `ResearchAgent/index.ts` |
| **MODIFY** | `ResearchAgent/methods/index.ts` |
| **MODIFY** | `ResearchAgent/types.ts` |
| **MIGRATE** | `workflows/research/cloudflare-changelog.ts` |
| **MIGRATE** | `utils/email/send/repo-discovery.ts` |
| **MIGRATE** | `routes/api/agents/research-orchestration.ts` |
| **DEPRECATE** | `db/schemas/app/cloudflare_changelog.ts` |
| **DEPRECATE** | `db/schemas/app/research.ts` (newsletter_repos) |

## Verification Plan

```bash
npx tsc --noEmit
test ! -f src/backend/src/ai/agents/backend/ResearchAgent/methods/discord/DiscordResearch.ts
pnpm run db:generate:core
```
