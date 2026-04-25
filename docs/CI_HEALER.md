 # CI Healer — Build Failure Analyzer

> Automated build failure detection, log extraction, and AI-powered remediation for Cloudflare Worker projects.

## Overview

The **CI Healer** is an automation that monitors GitHub `check_run` webhook events. When a CI check **fails** on any repository in the `jmbish04` organization, it automatically:

1. Fetches deployment logs from the Cloudflare API
2. Scans logs for known AI-agent failure patterns
3. Generates an imperative fix prompt via Workers AI
4. Dispatches the fix to Jules (or posts instructions on the PR)

> **⚠️ IMPORTANT: Failure-Only Trigger**
> 
> The CI Healer is **never** invoked on successful builds. The webhook handler contains an explicit gate:
> ```typescript
> if (
>   eventName === "check_run" &&
>   action === "completed" &&
>   conclusion === "failure"  // ← ONLY failures pass this gate
> )
> ```
> This means zero compute is wasted on passing CI runs.

---

## Architecture

```
┌──────────────┐     check_run.completed       ┌────────────────────┐
│   GitHub CI  │ ──── (conclusion: failure) ──→ │  Webhook Handler   │
│  (Actions)   │                                │  /api/webhooks     │
└──────────────┘                                └────────┬───────────┘
                                                         │
                                          ┌──────────────┴──────────────┐
                                          │                             │
                                          ▼                             │
                                ┌──────────────────┐                    │
                                │ inferWorkerName() │                    │
                                │ repo → script_name│                    │
                                └────────┬─────────┘                    │
                                         │                              │
                                         ▼                              │
                              ┌────────────────────┐                    │
                              │  fetchBuildLogs()   │                    │
                              │  Cloudflare API     │                    │
                              │  ┌────────────────┐ │                    │
                              │  │ Deployments API│ │                    │
                              │  │ GET /scripts/  │ │                    │
                              │  │ {name}/deploys │ │                    │
                              │  └────────────────┘ │                    │
                              │  ┌────────────────┐ │                    │
                              │  │ Tail Logs API  │ │                    │
                              │  │ POST /scripts/ │ │                    │
                              │  │ {name}/tails   │ │                    │
                              │  └────────────────┘ │                    │
                              └────────┬───────────┘                    │
                                       │                                │
                                       ▼                                │
                            ┌────────────────────────┐                  │
                            │ analyzeBuildFailure()    │                  │
                            │ ┌────────────────────┐  │                  │
                            │ │ Sentinel Pre-Scan  │  │                  │
                            │ │ (regex, no LLM)    │  │                  │
                            │ └────────────────────┘  │                  │
                            │ ┌────────────────────┐  │                  │
                            │ │ Workers AI Analysis│  │                  │
                            │ │ (LLM fix prompt)   │  │                  │
                            │ └────────────────────┘  │                  │
                            └────────┬───────────────┘                  │
                                     │                                  │
                                     ▼                                  │
                            ┌──────────────────┐                        │
                            │  Jules Session    │                        │
                            │  (auto-fix PR)    │◄───────────────────────┘
                            └──────────────────┘
```

---

## How We Map GitHub Failures → Cloudflare Logs

### Step 1: Extracting the Worker Name

When a `check_run` webhook fires, the payload includes:
```json
{
  "repository": {
    "name": "chef",
    "full_name": "jmbish04/chef",
    "owner": { "login": "jmbish04" }
  },
  "check_run": {
    "name": "deploy",
    "conclusion": "failure",
    "check_suite": {
      "head_branch": "feature/kitchen"
    }
  }
}
```

The `inferWorkerName()` function extracts the repo name from `full_name`:
- `jmbish04/chef` → `chef`
- `jmbish04/core-github-api` → `core-github-api`

**Convention:** The Cloudflare Worker `name` in `wrangler.jsonc` must match the GitHub repo name for this mapping to work.

### Step 2: Fetching Deployment Logs

With the script name, we hit two Cloudflare API endpoints:

#### Deployments API
```
GET https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{script_name}/deployments
```

Returns the most recent deployment record containing:
| Field | Description |
|-------|-------------|
| `id` | Deployment UUID |
| `created_on` | Timestamp |
| `source.type` | How it was deployed (`api`, `dash`, etc.) |
| `annotations` | Commit SHA, branch, author metadata |
| `build_error` | **The actual build failure message** |
| `error` | General error field |

#### Tail Logs API
```
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{script_name}/tails
Body: { "filters": [{ "status": ["error"] }] }
```

Creates a short-lived session that returns runtime error traces — useful for catching errors that don't appear in deployment metadata (e.g., uncaught exceptions during Worker startup).

### Step 3: Sentinel Guardrail Pre-Scan

Before invoking the LLM, the raw logs are scanned against known AI-agent failure patterns using simple regex matching (**zero LLM cost**):

| Pattern | What It Catches | Example Log Line |
|---------|----------------|-----------------|
| Lockfile Desync | Agent modified `package.json` without `pnpm install` | `ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY` |
| DO Export Omission | Agent added a Durable Object class but didn't export it | `Durable Object class MyAgent not found` |
| Invalid Binding | Agent referenced a binding that doesn't exist in `wrangler.jsonc` | `Binding name MY_DB is invalid` |
| Node Prefix Missing | Agent imported `crypto` instead of `node:crypto` | `Could not resolve "crypto"` |
| Entry File Missing | Agent deleted/moved the entrypoint without updating config | `Could not resolve "./src/index.ts"` |

If matches are found, they're injected into the LLM prompt as `🚨 ALERT` directives:
```
🚨 ALERT: Sentinel Guardrails detected the following known failure patterns:
- Lockfile Desynchronization (Missing or outdated packages)
- Node Built-in Missing Prefix (Esbuild error)

You MUST center your analysis and fix instructions around these specific root causes.
```

### Step 4: LLM Analysis

The combined log context (deployment metadata + tail logs + guardrail alerts) is sent to Workers AI with a system prompt that enforces:
- **Imperative instructions only** — no explanations, no pleasantries
- **Exact file paths** — reference specific files from the error output
- **Actionable commands** — the coding agent should be able to execute the fix immediately

The output is structured as:
1. **Analysis** — One paragraph explaining why the build failed
2. **Fix Prompt** — Direct instructions for the coding agent
3. **Relevant Logs** — The 10 most relevant log lines

### Step 5: Dispatch to Jules

The fix prompt is sent to a Jules session targeting the failing branch. Jules then:
1. Reads the fix instructions
2. Makes the necessary code changes
3. Pushes a commit to the PR branch
4. The CI re-runs automatically

---

## Key Files

| File | Purpose |
|------|---------|
| `src/backend/src/automations/pr/build-analyzer/analysis.ts` | Core module: log fetching, pattern matching, LLM analysis |
| `src/backend/src/routes/api/webhooks/index.ts` | Webhook handler: contains the `check_run.failure` gate |
| `src/backend/src/routes/api/frontend/repos/actions.ts` | Frontend API: manual build log analysis endpoint |

---

## Manual Trigger (Frontend)

The build analyzer can also be triggered manually from the frontend dashboard via the Actions API:
```
POST /api/frontend/repos/{owner}/{repo}/actions/analyze-build
```

This endpoint calls `fetchBuildLogs()` and `analyzeBuildFailure()` directly, bypassing the webhook gate. Useful for debugging deployment issues that don't originate from a GitHub check run.

---

## Adding New Failure Patterns

To teach the system to recognize a new common failure:

1. Open `src/backend/src/automations/pr/build-analyzer/analysis.ts`
2. Find the `knownPatterns` array inside `analyzeBuildFailure()`
3. Add a new entry:
```typescript
{ name: "Your Pattern Description", regex: /your-regex-here/i }
```
4. The regex should match the exact error string that appears in Cloudflare build logs
5. Deploy — the pattern will be active on the next check_run failure

---

## Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID for API calls |
| `CLOUDFLARE_API_TOKEN` | API token with Workers read permissions |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | For creating Jules sessions on the repo |
