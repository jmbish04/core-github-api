#!/usr/bin/env bash
# =============================================================================
# sentinel-agent.sh — Sentinel Task API CLI for Jules/Stitch agents
#
# Source this script inside a Sandbox or CI environment to get task management
# functions that talk to the Sentinel REST API.
#
# Usage:
#   source scripts/sentinel-agent.sh
#   sentinel_list_tasks [--repo github:owner/repo]
#   sentinel_claim_task <task-id> <assignee>
#   sentinel_update_task <task-id> <status> [notes]
#   sentinel_ask <task-id> <question>
#   sentinel_submit <task-id> [notes]
#   sentinel_get_status
#   sentinel_health
#
# Environment variables (required):
#   SENTINEL_API_URL      — Base URL of the worker (default: https://core-github-api.hacolby.workers.dev)
#   AGENTIC_WORKER_API_KEY — Auth key for the sentinel API
# =============================================================================

SENTINEL_API_URL="${SENTINEL_API_URL:-https://core-github-api.hacolby.workers.dev}"
SENTINEL_BASE="${SENTINEL_API_URL}/api/projects/sentinel"

# ─── Internal helpers ────────────────────────────────────────────────────────

_sentinel_key() {
    local key="${AGENTIC_WORKER_API_KEY:-${WORKER_API_KEY:-}}"
    if [[ -z "$key" ]]; then
        echo >&2 "[sentinel] ERROR: AGENTIC_WORKER_API_KEY or WORKER_API_KEY must be set."
        return 1
    fi
    echo "$key"
}

_sentinel_get() {
    local path="$1"
    local key
    key=$(_sentinel_key) || return 1
    curl -s -f \
        -H "Authorization: Bearer ${key}" \
        -H "Accept: application/json" \
        "${SENTINEL_BASE}${path}"
}

_sentinel_post() {
    local path="$1"
    local body="${2:-{}}"
    local key
    key=$(_sentinel_key) || return 1
    curl -s -f \
        -X POST \
        -H "Authorization: Bearer ${key}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -d "$body" \
        "${SENTINEL_BASE}${path}"
}

_sentinel_patch() {
    local path="$1"
    local body="${2:-{}}"
    local key
    key=$(_sentinel_key) || return 1
    curl -s -f \
        -X PATCH \
        -H "Authorization: Bearer ${key}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -d "$body" \
        "${SENTINEL_BASE}${path}"
}

# ─── Public API ───────────────────────────────────────────────────────────────

# List available (unclaimed) tasks.
# Usage: sentinel_list_tasks [repo-id]
# Example: sentinel_list_tasks "github:jmbish04/core-github-api"
sentinel_list_tasks() {
    local repo_id="${1:-}"
    local path="/tasks/available"
    [[ -n "$repo_id" ]] && path="${path}?repoId=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$repo_id" 2>/dev/null || echo "$repo_id")"
    echo "[sentinel] Listing available tasks..." >&2
    _sentinel_get "$path"
}

# Claim a task.
# Usage: sentinel_claim_task <task-id> <assignee>
# Example: sentinel_claim_task "task-uuid-123" "jules:session-abc"
sentinel_claim_task() {
    local task_id="${1:?Usage: sentinel_claim_task <task-id> <assignee>}"
    local assignee="${2:?Usage: sentinel_claim_task <task-id> <assignee>}"
    echo "[sentinel] Claiming task ${task_id} as ${assignee}..." >&2
    _sentinel_post "/tasks/${task_id}/claim" "{\"assignee\":\"${assignee}\"}"
}

# Update task status or notes.
# Usage: sentinel_update_task <task-id> <status> [notes]
# Status values: todo | in_progress | done | backlog | cancelled
# Example: sentinel_update_task "task-uuid-123" "in_progress" "Refactoring auth module"
sentinel_update_task() {
    local task_id="${1:?Usage: sentinel_update_task <task-id> <status> [notes]}"
    local status="${2:?Usage: sentinel_update_task <task-id> <status> [notes]}"
    local notes="${3:-}"
    local body
    if [[ -n "$notes" ]]; then
        # Escape notes for JSON
        local escaped_notes
        escaped_notes=$(printf '%s' "$notes" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"${notes}\"")
        body="{\"status\":\"${status}\",\"notes\":${escaped_notes}}"
    else
        body="{\"status\":\"${status}\"}"
    fi
    echo "[sentinel] Updating task ${task_id}: status=${status}..." >&2
    _sentinel_patch "/tasks/${task_id}" "$body"
}

# Ask the orchestrator a clarification question about a task.
# Usage: sentinel_ask <task-id> <question>
# Example: sentinel_ask "task-uuid-123" "Should I use the existing epics table or create a new one?"
sentinel_ask() {
    local task_id="${1:?Usage: sentinel_ask <task-id> <question>}"
    local question="${2:?Usage: sentinel_ask <task-id> <question>}"
    local escaped_q
    escaped_q=$(printf '%s' "$question" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"${question}\"")
    echo "[sentinel] Broadcasting clarification request for task ${task_id}..." >&2
    _sentinel_post "/tasks/${task_id}/clarify" "{\"question\":${escaped_q}}"
}

# Submit a task for review (triggers JUDGE_AGENT).
# Usage: sentinel_submit <task-id> [notes]
# Example: sentinel_submit "task-uuid-123" "PR at https://github.com/org/repo/pull/42"
sentinel_submit() {
    local task_id="${1:?Usage: sentinel_submit <task-id> [notes]}"
    local notes="${2:-}"
    local body
    if [[ -n "$notes" ]]; then
        local escaped_notes
        escaped_notes=$(printf '%s' "$notes" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"${notes}\"")
        body="{\"notes\":${escaped_notes}}"
    else
        body="{}"
    fi
    echo "[sentinel] Submitting task ${task_id} for review..." >&2
    _sentinel_post "/tasks/${task_id}/submit" "$body"
}

# Get system status (task counts, active claims, recent events).
# Usage: sentinel_get_status
sentinel_get_status() {
    echo "[sentinel] Fetching system status..." >&2
    _sentinel_get "/status"
}

# Get task details with story/epic context.
# Usage: sentinel_get_task <task-id>
sentinel_get_task() {
    local task_id="${1:?Usage: sentinel_get_task <task-id>}"
    _sentinel_get "/tasks/${task_id}"
}

# Health check.
# Usage: sentinel_health
sentinel_health() {
    _sentinel_get "/health"
}

echo "[sentinel] sentinel-agent.sh loaded. API: ${SENTINEL_BASE}" >&2
echo "[sentinel] Commands: sentinel_list_tasks | sentinel_claim_task | sentinel_update_task | sentinel_ask | sentinel_submit | sentinel_get_status | sentinel_get_task | sentinel_health" >&2
