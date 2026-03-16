"""
GitHub Research Agent – Routes ALL AI traffic through core-github-api Worker.

Endpoint map (base: https://core-github-api.hacolby.workers.dev):
  POST /api/ai/gateway/chat/completions   – AI Gateway chat (Bearer AI_GATEWAY_TOKEN)
  POST /api/ai/gateway/embeddings         – AI Gateway embeddings
  GET  /api/orchestration/config          – Returns live AI Gateway URL
  POST /api/orchestration/check-deduplication – D1 repo dedup check
  GET  /api/orchestration/ws/{session_id} – Durable Object WebSocket (D1-backed session)
  GET  /api/ws/action-worker?apiKey=...   – Action Worker WS (run_ai, query_rules, etc.)
  POST /api/webhooks/action-callback      – Sync final results back to D1
  GET  /health                            – Health check
"""

import os
import json
import asyncio
import sys
import threading
import requests
import websocket                  # pip install websocket-client
from typing import List, Literal, Optional, Any
from pydantic import BaseModel, Field
from github import Github

# OpenAI Agents SDK
from openai import AsyncOpenAI
from agents import (
    Agent,
    Runner,
    RunConfig,
    ModelProvider,
    Model,
    OpenAIChatCompletionsModel,
    function_tool,
    trace,
    ItemHelpers,
    TResponseInputItem,
)
from agents.memory.session import Session

# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ──────────────────────────────────────────────────────────────────────────────

WORKER_BASE_URL = (
    os.environ.get("WORKER_BASE_URL", "https://core-github-api.hacolby.workers.dev").rstrip("/")
)

# AI_GATEWAY_TOKEN is the Bearer token accepted by /api/ai/gateway/*
# This is the secret stored in Cloudflare as AI_GATEWAY_TOKEN.
AI_GATEWAY_TOKEN = os.environ.get("CLOUDFLARE_AI_GATEWAY_TOKEN") or os.environ.get("CF_AI_GATEWAY_TOKEN")

# WORKER_API_KEY is used for the WebSocket action-worker endpoint
WORKER_API_KEY = os.environ.get("WORKER_API_KEY") or os.environ.get("CF_WORKER_API_KEY")

# Default model – note the Worker's formatModelId() strips the @cf/ prefix if needed
MODEL_NAME = "@cf/openai/gpt-oss-120b"

if not AI_GATEWAY_TOKEN:
    print("::error::Missing AI_GATEWAY_TOKEN for core-github-api Worker")
    sys.exit(1)

# ──────────────────────────────────────────────────────────────────────────────
# AI GATEWAY  –  OpenAI-compatible base URL via our Worker proxy
# /api/ai/gateway is mounted on the Worker and forwards to Cloudflare AI Gateway
# using the server-side AI_GATEWAY_TOKEN binding (we never expose CF account IDs).
# ──────────────────────────────────────────────────────────────────────────────

WORKER_GATEWAY_BASE_URL = f"{WORKER_BASE_URL}/api/ai/gateway"

client = AsyncOpenAI(
    api_key=AI_GATEWAY_TOKEN,          # Worker validates this as Bearer token
    base_url=WORKER_GATEWAY_BASE_URL,  # proxied through our own Worker
)


class CloudflareGatewayProvider(ModelProvider):
    """
    Routes OpenAI Agents SDK traffic through the core-github-api Worker's
    /api/ai/gateway/* proxy which internally calls Cloudflare AI Gateway.
    """

    def get_model(self, model_name: str | None) -> Model:
        return OpenAIChatCompletionsModel(
            model=model_name or MODEL_NAME,
            openai_client=client,
        )


CF_PROVIDER = CloudflareGatewayProvider()
CF_RUN_CONFIG = RunConfig(model_provider=CF_PROVIDER)


# ──────────────────────────────────────────────────────────────────────────────
# HELPER – sync REST calls to the Worker
# ──────────────────────────────────────────────────────────────────────────────

def _worker_headers(include_auth: bool = True) -> dict:
    h = {"Content-Type": "application/json"}
    if include_auth:
        h["Authorization"] = f"Bearer {AI_GATEWAY_TOKEN}"
    return h


def worker_get(path: str, **kwargs) -> requests.Response:
    return requests.get(f"{WORKER_BASE_URL}{path}", headers=_worker_headers(), timeout=30, **kwargs)


def worker_post(path: str, payload: dict, **kwargs) -> requests.Response:
    return requests.post(
        f"{WORKER_BASE_URL}{path}",
        json=payload,
        headers=_worker_headers(),
        timeout=30,
        **kwargs,
    )


# ──────────────────────────────────────────────────────────────────────────────
# D1-BACKED SESSION  –  Durable Object WebSocket at /api/orchestration/ws/{id}
# The DO persists session items to D1 via Drizzle ORM on the Worker side.
# ──────────────────────────────────────────────────────────────────────────────

class CloudflareD1Session(Session):
    """
    Session backed by the AgentSessionDO Durable Object.
    Connects via WebSocket to /api/orchestration/ws/{session_id} on the Worker.
    All reads/writes are persisted in D1 by the DO.
    Falls back to an in-process cache if the WS connection cannot be established.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id or "default-research-session"
        self._local_cache: List[Any] = []
        self._ws: Optional[websocket.WebSocket] = None
        self._ws_lock = threading.Lock()
        self._connect_ws()

    # ── WebSocket lifecycle ──────────────────────────────────────────────────

    def _ws_url(self) -> str:
        ws_base = WORKER_BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
        return f"{ws_base}/api/orchestration/ws/{self.session_id}?apiKey={AI_GATEWAY_TOKEN}"

    def _connect_ws(self) -> None:
        try:
            ws = websocket.create_connection(self._ws_url(), timeout=10)
            self._ws = ws
            print(f"[D1Session] WebSocket connected for session: {self.session_id}")
        except Exception as e:
            print(f"[D1Session] WS connect failed (using local cache fallback): {e}")
            self._ws = None

    def _ws_send(self, payload: dict) -> Optional[dict]:
        """Send a JSON payload and wait for a response. Returns parsed response or None."""
        with self._ws_lock:
            if self._ws is None:
                return None
            try:
                self._ws.send(json.dumps(payload))
                raw = self._ws.recv()
                return json.loads(raw)
            except Exception as e:
                print(f"[D1Session] WS send error: {e}")
                self._ws = None   # mark as dead; subsequent calls fall back to cache
                return None

    # ── Session protocol ────────────────────────────────────────────────────

    async def get_session_id(self) -> str:
        return self.session_id

    async def get_items(self, limit: int | None = None) -> list[Any]:
        response = self._ws_send({"action": "get_items", "limit": limit, "sessionId": self.session_id})
        if response and "items" in response:
            self._local_cache = response["items"]
        if limit is not None and limit >= 0:
            return self._local_cache[-limit:]
        return self._local_cache

    async def add_items(self, items: list[Any]) -> None:
        if not items:
            return
        cloned = json.loads(json.dumps(items))
        self._local_cache.extend(cloned)
        self._ws_send({"action": "add_items", "items": cloned, "sessionId": self.session_id})

    async def pop_item(self) -> Any | None:
        response = self._ws_send({"action": "pop_item", "sessionId": self.session_id})
        if response and "item" in response:
            return response["item"]
        if self._local_cache:
            return self._local_cache.pop()
        return None

    async def clear_session(self) -> None:
        self._local_cache = []
        self._ws_send({"action": "clear_session", "sessionId": self.session_id})

    def close(self) -> None:
        with self._ws_lock:
            if self._ws:
                try:
                    self._ws.close()
                except Exception:
                    pass
                self._ws = None


# ──────────────────────────────────────────────────────────────────────────────
# ACTION WORKER  –  /api/ws/action-worker WebSocket
# Actions: run_ai | query_rules | kickoff_jules | fetch_build_logs
# ──────────────────────────────────────────────────────────────────────────────

class ActionWorkerWS:
    """One-shot WebSocket caller for the /api/ws/action-worker endpoint."""

    def __init__(self):
        ws_base = WORKER_BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
        self._url = f"{ws_base}/api/ws/action-worker?apiKey={WORKER_API_KEY or AI_GATEWAY_TOKEN}"

    def _call(self, payload: dict) -> Optional[dict]:
        try:
            ws = websocket.create_connection(self._url, timeout=15)
            ws.send(json.dumps(payload))
            raw = ws.recv()
            ws.close()
            return json.loads(raw)
        except Exception as e:
            print(f"[ActionWorker] WS call failed: {e}")
            return None

    def run_ai(self, prompt: str, model: str = MODEL_NAME) -> Optional[str]:
        result = self._call({"action": "run_ai", "model": model, "prompt": prompt})
        return result.get("result") if result else None

    def query_rules(self, target: str = "golden_path") -> Optional[list]:
        result = self._call({"action": "query_rules", "target": target})
        return result.get("result") if result else None

    def kickoff_jules(self, repo: str, objective: str) -> Optional[dict]:
        result = self._call({"action": "kickoff_jules", "repo": repo, "objective": objective})
        return result.get("result") if result else None

    def fetch_build_logs(self, worker_name: str) -> Optional[dict]:
        result = self._call({"action": "fetch_build_logs", "worker_name": worker_name})
        return result.get("result") if result else None


# ──────────────────────────────────────────────────────────────────────────────
# D1 DEDUPLICATION  –  /api/orchestration/check-deduplication
# ──────────────────────────────────────────────────────────────────────────────

def check_deduplication(repo_urls: List[str]) -> List[str]:
    """
    POST /api/orchestration/check-deduplication
    Returns only the URLs that have NOT yet been stored in D1.
    """
    if not repo_urls:
        return []
    try:
        resp = worker_post("/api/orchestration/check-deduplication", {"repoUrls": repo_urls})
        resp.raise_for_status()
        return resp.json().get("newRepos", repo_urls)
    except Exception as e:
        print(f"[Dedup] check failed (assuming all are new): {e}")
        return repo_urls


# ──────────────────────────────────────────────────────────────────────────────
# TOOLS
# ──────────────────────────────────────────────────────────────────────────────

@function_tool
def search_github(query: str) -> str:
    """Searches GitHub for repositories matching the query and returns the top results."""
    if not os.environ.get("GITHUB_TOKEN"):
        print("[Tool] No GITHUB_TOKEN, skipping search")
        return json.dumps([])

    g = Github(os.environ["GITHUB_TOKEN"])
    print(f"[Tool Exec] Searching GitHub: {query}")
    try:
        repos = g.search_repositories(query, sort="stars", order="desc")
        results = []
        for i, repo in enumerate(repos):
            if i >= 4:
                break
            try:
                readme = repo.get_readme().decoded_content.decode("utf-8")[:500]
            except Exception:
                readme = "No README"
            results.append(
                {
                    "name": repo.full_name,
                    "url": repo.html_url,
                    "stars": repo.stargazers_count,
                    "description": repo.description,
                    "readme_snippet": readme,
                }
            )
        return json.dumps(results)
    except Exception as e:
        print(f"[Tool Exec] Search failed: {e}")
        return json.dumps([])


# ──────────────────────────────────────────────────────────────────────────────
# DATA MODELS
# ──────────────────────────────────────────────────────────────────────────────

class SearchPlan(BaseModel):
    rationale: str = Field(..., description="Reasoning for the search strategy")
    queries: List[str] = Field(..., description="List of 3 distinct GitHub search queries")


class RepoFinding(BaseModel):
    name: str
    url: str
    stars: int
    description: str = "No description"
    relevance_score: int = Field(..., description="1-10 score of relevance to user prompt")


class ResearchReport(BaseModel):
    findings: List[RepoFinding]


class JudgeFeedback(BaseModel):
    status: Literal["pass", "needs_more_data", "fail"]
    critique: str = Field(..., description="Critique of the findings")
    approved_urls: List[str] = Field(
        default_factory=list, description="List of approved repository URLs"
    )


# ──────────────────────────────────────────────────────────────────────────────
# AGENTS
# ──────────────────────────────────────────────────────────────────────────────

planner_agent = Agent(
    name="Orchestrator",
    instructions="You are a Search Planner. Break the user request into 3 specific, non-overlapping GitHub search queries.",
    model=MODEL_NAME,
    output_type=SearchPlan,
)

researcher_agent = Agent(
    name="Researcher",
    instructions=(
        "You are a GitHub Researcher. Use the `search_github` tool to execute the search query. "
        "Analyze raw findings and format a structured report filtering for relevance to the original prompt."
    ),
    model=MODEL_NAME,
    tools=[search_github],
    output_type=ResearchReport,
)

judge_agent = Agent(
    name="Judge",
    instructions=(
        "You evaluate the gathered GitHub repositories against the user's prompt. "
        "If the findings are poor or do not answer the prompt, output 'needs_more_data' and provide a strict critique. "
        "If they fully address the prompt, output 'pass' and approve the exact URLs that matter."
    ),
    model=MODEL_NAME,
    output_type=JudgeFeedback,
)


# ──────────────────────────────────────────────────────────────────────────────
# MAIN WORKFLOW
# ──────────────────────────────────────────────────────────────────────────────

async def main() -> None:
    prompt = os.environ.get("USER_PROMPT")
    if not prompt:
        print("::error::Missing USER_PROMPT")
        sys.exit(1)

    session_id = os.environ.get("GITHUB_RUN_ID", "local-run")
    print(f"--- STARTING RESEARCH: {prompt} ---")

    # Health-check the Worker before we begin
    try:
        health = requests.get(f"{WORKER_BASE_URL}/health", timeout=10)
        health.raise_for_status()
        print(f"[Worker] Health OK: {health.json()}")
    except Exception as e:
        print(f"::warning::Worker health check failed: {e}")

    # Wire up the D1-backed Durable Object session
    session = CloudflareD1Session(session_id=session_id)

    # ── A. PLAN PHASE ────────────────────────────────────────────────────────
    print(">>> Planning Phase")
    plan_result = await Runner.run(
        planner_agent,
        f"User Request: {prompt}",
        run_config=CF_RUN_CONFIG,
        session=session,
    )
    plan = plan_result.final_output_as(SearchPlan)
    print(f"Plan: {plan.queries}")

    # ── B. D1 DEDUPLICATION CHECK ───────────────────────────────────────────
    # (We'll re-run this after finding results to filter already-known repos)

    # ── C. SEARCH & SUMMARIZE PHASE (Parallel) ──────────────────────────────
    print(">>> Analysis Phase (Parallel Execution)")

    with trace("Parallel GitHub Searches"):
        tasks = [
            Runner.run(
                researcher_agent,
                f"User Prompt: {prompt}\n\nPlease execute this exact query: {q}",
                run_config=CF_RUN_CONFIG,
            )
            for q in plan.queries
        ]
        research_results = await asyncio.gather(*tasks)

    all_findings: List[RepoFinding] = []
    for res in research_results:
        report = res.final_output_as(ResearchReport)
        all_findings.extend(report.findings)

    print(f"Researchers found {len(all_findings)} total candidate repos.")

    # Deduplicate against D1 – only surface repos not seen in previous runs
    all_urls = [f.url for f in all_findings]
    new_urls = check_deduplication(all_urls)
    new_findings = [f for f in all_findings if f.url in new_urls]
    print(f"After D1 dedup: {len(new_findings)} new repos (skipped {len(all_findings) - len(new_findings)} known).")

    if not new_findings:
        print("::notice::All repos already in D1. Nothing new to report.")
        session.close()
        return

    # ── D. JUDGE PHASE (LLM as a Judge) ─────────────────────────────────────
    print(">>> Judging Phase")

    max_rounds = 3
    approved_repos: List[RepoFinding] = []
    final_status = "fail"
    critique = ""

    judge_input: List[TResponseInputItem] = [
        {
            "role": "user",
            "content": (
                f"Original Prompt: {prompt}\n\n"
                f"Findings: {json.dumps([f.model_dump() for f in new_findings])}"
            ),
        }
    ]

    for round_num in range(max_rounds):
        verdict_result = await Runner.run(
            judge_agent,
            judge_input,
            run_config=CF_RUN_CONFIG,
            session=session,
        )
        verdict = verdict_result.final_output_as(JudgeFeedback)

        print(f"[Round {round_num + 1}] Judge Verdict: {verdict.status.upper()}")
        print(f"Critique: {verdict.critique}")

        final_status = verdict.status
        critique = verdict.critique
        approved_repos = [r for r in new_findings if r.url in verdict.approved_urls]

        if verdict.status == "pass":
            print("Judge satisfied. Exiting evaluation loop.")
            break

        print("Re-evaluating based on critique...")
        judge_input = verdict_result.to_input_list()
        judge_input.append(
            {
                "role": "user",
                "content": "Review your previous critique. Is there any way we can approve a partial subset of these repos? State your final decision.",
            }
        )

    # ── E. SYNC RESULTS BACK TO WORKER (D1 via /api/webhooks/action-callback) ──
    final_payload = {
        "prompt": prompt,
        "status": final_status,
        "judge_notes": critique,
        "session_id": session_id,
        "findings": (
            [r.model_dump() for r in approved_repos]
            if approved_repos
            else [r.model_dump() for r in new_findings]
        ),
    }

    callback_path = os.environ.get("CALLBACK_PATH", "/api/webhooks/action-callback")
    print(f"Posting {len(final_payload['findings'])} approved repos to {WORKER_BASE_URL}{callback_path}...")
    try:
        resp = worker_post(callback_path, final_payload)
        resp.raise_for_status()
        print("::notice::Successfully synced results to Cloudflare Worker (D1).")
    except Exception as e:
        print(f"::error::Failed to sync results to Worker: {e}")

    # Clean up WS connection
    session.close()
    print("--- RESEARCH COMPLETE ---")


if __name__ == "__main__":
    asyncio.run(main())
