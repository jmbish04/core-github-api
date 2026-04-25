# Backlog Deep Hierarchy Implementation

- `[x]` **Data Backup**
  - `[x]` Dump current `stories` and `tasks` from DB to `/docs/backlog_backup.json` (or similar).
- `[x]` **Backend Schemas**
  - `[x]` Create `plan_revisions.ts` schema
  - `[x]` Create `mappings.ts` schema (M:M tables)
  - `[x]` Update `phases.ts`
  - `[x]` Update `sprints.ts`
  - `[x]` Update `epics.ts`
  - `[x]` Update `stories.ts`
  - `[x]` Update `tasks.ts`
  - `[x]` Update `index.ts` to export all and setup Drizzle relations
- `[x]` **Backend APIs**
  - `[x]` Create API route for deep fetching the full backlog hierarchy
  - `[x]` Create API route for posting/putting deep nested JSON updates (magical normalizer)
- `[x]` **Frontend Views**
  - `[x]` Update `TrackerReportsViewBeta.tsx` (or whatever maps to `/projects/tracker-beta`)
  - `[x]` Update Tracker Shadcn view
  - `[x]` Update Base Tracker view
