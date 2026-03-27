import asyncio
import os
import json
import logging
import aiohttp
import websockets
from typing import List, Dict, Any

# Configure base URL, can be overridden by env
API_BASE = os.environ.get("WORKER_API_BASE", "http://localhost:8787").rstrip("/")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

class CloudflareD1Session:
    """Manages the WebSocket connection to the Cloudflare Worker Durable Object."""
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.ws_url = f"{API_BASE}/api/orchestration/ws/{session_id}".replace("http", "ws")
        self.ws_conn = None
        self._local_cache: List[Dict[str, Any]] = []

    async def connect(self):
        logger.info(f"Connecting to session {self.session_id} over WebSocket")
        self.ws_conn = await websockets.connect(self.ws_url)
        # Start background listener to maintain shared context window
        asyncio.create_task(self._listen())

    async def _listen(self):
        """Background task that reads incoming WS broadcasts."""
        try:
            async for message in self.ws_conn:
                data = json.loads(message)
                logger.info(f"[Shared Context Received] {data.get('type')}")
                self._local_cache.append(data)
        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket connection closed")
        except Exception as e:
            logger.error(f"WebSocket listener error: {e}")

    async def add_items(self, items: List[Dict[str, Any]]):
        """Pushes new items to the session over WebSocket."""
        if not self.ws_conn:
            await self.connect()
        for item in items:
            await self.ws_conn.send(json.dumps(item))

    async def request_sync(self):
        """Requests current memory state from the DB."""
        await self.add_items([{"type": "sync_request"}])

    async def close(self):
        """Gracefully close connection."""
        if self.ws_conn:
            await self.ws_conn.close()


async def get_config() -> str:
    """Fetch gateway URL from the Worker."""
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_BASE}/api/orchestration/config") as resp:
            data = await resp.json()
            return data["aiGatewayUrl"]


async def check_deduplication(repo_urls: List[str]) -> List[str]:
    """Filters out already-researched repositories against the D1 DB."""
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{API_BASE}/api/orchestration/check-deduplication",
            json={"repoUrls": repo_urls}
        ) as resp:
            data = await resp.json()
            return data.get("newRepos", [])


async def run_agent(role: str, repo_url: str, session: CloudflareD1Session):
    """Simulates an individual OpenAI SDK parallel agent."""
    logger.info(f"[{role}] Starting analysis for {repo_url}")
    
    thought = {
        "type": "agent_thought",
        "payload": {
            "agentRole": role,
            "thought": f"Analyzing structure for {repo_url}..."
        }
    }
    await session.add_items([thought])
    
    # Simulate API/LLM execution time
    await asyncio.sleep(2) 
    
    finding = {
        "type": "agent_finding",
        "payload": {
            "repoUrl": repo_url,
            "summary": f"Identified key architectural patterns in {role} for {repo_url}",
            "agentRole": role
        }
    }
    await session.add_items([finding])
    logger.info(f"[{role}] Completed findings for {repo_url}")


async def main():
    # 1. Fetch AI Gateway settings dynamically
    try:
        ai_gateway_url = await get_config()
        logger.info(f"Configured OpenAI SDK with Gateway: {ai_gateway_url}")
        os.environ["OPENAI_BASE_URL"] = ai_gateway_url
    except Exception as e:
        logger.warning(f"Could not fetch AI Gateway Config: {e}. Defaulting to standard endpoints.")

    # 2. Planning Phase deduplication
    potential_repos = [
        "https://github.com/jmbish04/repo-alpha",
        "https://github.com/jmbish04/repo-beta",
        "https://github.com/jmbish04/core-github-api",
        "https://github.com/jmbish04/repo-delta"
    ]

    new_repos = await check_deduplication(potential_repos)
    logger.info(f"Filtered to new repos: {new_repos}")

    top_repos = new_repos[:5]
    if not top_repos:
        logger.info("No new repositories to research. Exiting.")
        return

    # 3. Setup WebSocket Session (CloudflareD1Session)
    session_id = "multi-agent-research-101"
    cf_session = CloudflareD1Session(session_id)
    await cf_session.connect()
    
    # Pre-warm context by asking for historical sync
    await cf_session.request_sync()
    await asyncio.sleep(1) # wait for sync

    # 4. Parallel Execution Fan-Out
    roles = ["Frontend Analyzer", "Backend Analyzer", "Retrofit Specialist"]
    
    tasks = []
    # Distribute top 5 repos to parallel role agents
    for repo in top_repos:
        for role in roles:
            tasks.append(run_agent(role, repo, cf_session))

    await asyncio.gather(*tasks)

    # Allow final messages to settle
    await asyncio.sleep(2)
    await cf_session.close()
    logger.info(f"Session {session_id} finished. Total shared cache size: {len(cf_session._local_cache)}")

if __name__ == "__main__":
    asyncio.run(main())
