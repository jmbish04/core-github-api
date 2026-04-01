# Gap Remediation Plan

This document outlines the implementation plan to address the gaps identified in the retrospective.

## P0 — Critical Fixes

### 1. Add Apology-Based Doom-Loop Detection to JulesOverseer
- **Target File:** `src/backend/src/ai/agents/JulesOverseer.ts`
- **Actions:**
  - Import `learningAiInsights` from `@db/schemas/github/learning`.
  - Add `APOLOGY_PATTERNS` and `LOOP_THRESHOLD` constants.
  - Implement `detectAndIntervene` to check recent messages for apology loops.
  - Trigger intervention (message override, D1 insert, and webhook broadcast) when a loop is detected.
  - Integrate `detectAndIntervene` into the main polling loop (`checkJulesStatus`).

### 2. Add `db:auto` Script to package.json
- **Target File:** `package.json`
- **Actions:**
  - Add `"db:auto": "pnpm run db:generate:all && pnpm run migrate:local:all && wrangler types"` to the scripts section.

## P1 — Important Fixes

### 3. Add `/ingest` Endpoint to JulesOverseer
- **Target File:** `src/backend/src/ai/agents/JulesOverseer.ts`
- **Actions:**
  - Add a handler for `POST /ingest` in the `fetch` method.
  - Ingest insights to `learning_ai_insights` or log agent events based on payload type.

### 4. Add `streamInteraction()` to JulesService
- **Target File:** `src/backend/src/services/jules/service.ts`
- **Actions:**
  - Implement `streamInteraction` method to proxy stream data / polling events to the Overseer's ingest endpoint.

### 5. Add `callWithMonitoring()` to StitchService
- **Target File:** `src/backend/src/services/stitch/service.ts`
- **Actions:**
  - Implement `callWithMonitoring` wrapping `callTool`, emitting start/complete events to the Overseer.

### 6. Wrap Learning Dashboard in AppSidebar Layout
- **Target File:** `src/frontend/src/pages/learning/dashboard.astro`
- **Actions:**
  - Update layout component to use `AppSidebar` for consistent navigation.

### 7. Add `/health/learning` Root-Level Health Endpoint
- **Target File:** `src/backend/src/routes/api/ops/health.ts` (or relevant health route)
- **Actions:**
  - Add or redirect `GET /health/learning` to serve the appropriate learning health response.

## Pre-commit Steps
- Complete pre commit steps to ensure proper testing, verification, review, and reflection are done.
