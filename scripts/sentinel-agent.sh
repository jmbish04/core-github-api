#!/usr/bin/env bash
# =============================================================================
# sentinel-agent.sh
# =============================================================================
# Helper functions for agents running inside Sandbox to interact with the
# Sentinel Task API mounted at /api/projects/sentinel.
#
# Usage: source this file inside your agent script, then call the functions.
#
# Authentication: reads AGENTIC_WORKER_API_KEY or WORKER_API_KEY from env.
#
# Example:
#   source /scripts/sentinel-agent.sh
#   sentinel_list_tasks
#   sentinel_claim_task "task-uuid" "my-agent"
# =============================================================================

# ---------------------------------------------------------------------------
# Resolve base URL
# ---------------------------------------------------------------------------
: "${SENTINEL_BASE_URL:=http://localhost:8787}"
SENTINEL_API="${SENTINEL_BASE_URL}/api/projects/sentinel"

# ---------------------------------------------------------------------------
# Resolve API key: prefer AGENTIC_WORKER_API_KEY, fall back to WORKER_API_KEY
# ---------------------------------------------------------------------------
_sentinel_api_key() {
  if [ -n "${AGENTIC_WORKER_API_KEY:-}" ]; then
    echo "${AGENTIC_WORKER_API_KEY}"
  elif [ -n "${WORKER_API_KEY:-}" ]; then
    echo "${WORKER_API_KEY}"
  else
    echo ""
  fi
}

# ---------------------------------------------------------------------------
# Internal helper: issue a curl request with auth headers
# Usage: _sentinel_curl <method> <path> [curl-extra-args...]
# ---------------------------------------------------------------------------
_sentinel_curl() {
  local method="$1"
  local path="$2"
  shift 2
  local api_key
  api_key="$(_sentinel_api_key)"

  local auth_header=""
  if [ -n "$api_key" ]; then
    auth_header="-H \"X-API-Key: ${api_key}\""
  fi

  eval curl -s -X "${method}" \
    ${auth_header} \
    -H "Content-Type: application/json" \
    "${SENTINEL_API}${path}" \
    "$@"
}

# ---------------------------------------------------------------------------
# sentinel_list_tasks
# Lists all available (unclaimed) tasks.
# ---------------------------------------------------------------------------
sentinel_list_tasks() {
  _sentinel_curl GET "/tasks/available"
}

# ---------------------------------------------------------------------------
# sentinel_claim_task <taskId> <assignee>
# Claim a task by ID for a given assignee.
# ---------------------------------------------------------------------------
sentinel_claim_task() {
  local task_id="$1"
  local assignee="$2"

  if [ -z "$task_id" ] || [ -z "$assignee" ]; then
    echo '{"error":"Usage: sentinel_claim_task <taskId> <assignee>"}' >&2
    return 1
  fi

  local body
  body=$(printf '{"assignee":"%s"}' "$assignee")

  _sentinel_curl POST "/tasks/${task_id}/claim" -d "$body"
}

# ---------------------------------------------------------------------------
# sentinel_update_task <taskId> <status> [notes]
# PATCH the task status and optional notes.
# ---------------------------------------------------------------------------
sentinel_update_task() {
  local task_id="$1"
  local status="$2"
  local notes="${3:-}"

  if [ -z "$task_id" ] || [ -z "$status" ]; then
    echo '{"error":"Usage: sentinel_update_task <taskId> <status> [notes]"}' >&2
    return 1
  fi

  local body
  if [ -n "$notes" ]; then
    # Escape the notes string for JSON
    local escaped_notes
    escaped_notes=$(printf '%s' "$notes" | sed 's/"/\\"/g')
    body=$(printf '{"status":"%s","notes":"%s"}' "$status" "$escaped_notes")
  else
    body=$(printf '{"status":"%s"}' "$status")
  fi

  _sentinel_curl PATCH "/tasks/${task_id}" -d "$body"
}

# ---------------------------------------------------------------------------
# sentinel_ask <taskId> "question"
# Post a clarification question for a task.
# ---------------------------------------------------------------------------
sentinel_ask() {
  local task_id="$1"
  local question="$2"

  if [ -z "$task_id" ] || [ -z "$question" ]; then
    echo '{"error":"Usage: sentinel_ask <taskId> \"question\""}' >&2
    return 1
  fi

  local escaped_q
  escaped_q=$(printf '%s' "$question" | sed 's/"/\\"/g')
  local body
  body=$(printf '{"question":"%s"}' "$escaped_q")

  _sentinel_curl POST "/tasks/${task_id}/clarify" -d "$body"
}

# ---------------------------------------------------------------------------
# sentinel_submit <taskId> [notes]
# Mark a task as submitted/complete.
# ---------------------------------------------------------------------------
sentinel_submit() {
  local task_id="$1"
  local notes="${2:-}"

  if [ -z "$task_id" ]; then
    echo '{"error":"Usage: sentinel_submit <taskId> [notes]"}' >&2
    return 1
  fi

  local body
  if [ -n "$notes" ]; then
    local escaped_notes
    escaped_notes=$(printf '%s' "$notes" | sed 's/"/\\"/g')
    body=$(printf '{"notes":"%s"}' "$escaped_notes")
  else
    body='{}'
  fi

  _sentinel_curl POST "/tasks/${task_id}/submit" -d "$body"
}

# ---------------------------------------------------------------------------
# sentinel_get_task <taskId>
# Fetch details for a specific task.
# ---------------------------------------------------------------------------
sentinel_get_task() {
  local task_id="$1"

  if [ -z "$task_id" ]; then
    echo '{"error":"Usage: sentinel_get_task <taskId>"}' >&2
    return 1
  fi

  _sentinel_curl GET "/tasks/${task_id}"
}

# ---------------------------------------------------------------------------
# sentinel_get_status
# Get overall sentinel service status.
# ---------------------------------------------------------------------------
sentinel_get_status() {
  _sentinel_curl GET "/status"
}

# ---------------------------------------------------------------------------
# sentinel_health
# Health check endpoint.
# ---------------------------------------------------------------------------
sentinel_health() {
  _sentinel_curl GET "/health"
}

# ---------------------------------------------------------------------------
# Print usage when sourced
# ---------------------------------------------------------------------------
cat <<'USAGE'
=====================================================================
  sentinel-agent.sh — Sentinel Task API client
=====================================================================
  Functions available after sourcing this file:

  sentinel_list_tasks
      GET /tasks/available — list all available (unclaimed) tasks

  sentinel_claim_task <taskId> <assignee>
      POST /tasks/{id}/claim — claim a task for this agent

  sentinel_update_task <taskId> <status> [notes]
      PATCH /tasks/{id} — update task status (and optional notes)

  sentinel_ask <taskId> "question"
      POST /tasks/{id}/clarify — ask a clarification question

  sentinel_submit <taskId> [notes]
      POST /tasks/{id}/submit — mark task done / submit result

  sentinel_get_task <taskId>
      GET /tasks/{id} — get full task details

  sentinel_get_status
      GET /status — sentinel service status

  sentinel_health
      GET /health — health check

  Auth: set AGENTIC_WORKER_API_KEY or WORKER_API_KEY in environment.
  Base URL: set SENTINEL_BASE_URL (default: http://localhost:8787)
=====================================================================
USAGE
