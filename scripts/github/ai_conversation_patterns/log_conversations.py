import os
import sqlite3
import subprocess
import json
import logging
import requests
import argparse
from datetime import datetime
import time
from typing import List, Optional, Dict, Any, Union

# --- LOGGING CONFIGURATION ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("Codex-Logger")

class TokenManager:
    """Interface for the 'tokens' CLI service."""
    @staticmethod
    def get(token_name: str) -> str:
        try:
            cmd = f"tokens show {token_name} --value-only"
            value = subprocess.check_output(cmd, shell=True, text=True).strip()
            return value
        except Exception as e:
            logger.error(f"❌ Failed to fetch token {token_name}: {e}")
            return ""

class DatabaseManager:
    """Handles SQLite persistence in the localized pattern directory."""
    def __init__(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.db_path = os.path.join(base_dir, "conversations.db")
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        logger.info(f"📂 DB Location: {self.db_path}")
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        self._create_table()

    def _create_table(self):
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS threads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                source TEXT NOT NULL,
                author TEXT NOT NULL,
                message TEXT NOT NULL,
                github_repo TEXT,
                identifier TEXT,
                UNIQUE(timestamp, author, identifier) ON CONFLICT IGNORE
            )
        ''')
        self.cursor.execute('CREATE INDEX IF NOT EXISTS idx_identifier ON threads(identifier)')
        self.conn.commit()

    def is_identifier_synced(self, identifier: str) -> bool:
        """Check if an identifier (PR URL, Session ID) is already in the DB."""
        self.cursor.execute('SELECT 1 FROM threads WHERE identifier = ? LIMIT 1', (identifier,))
        return self.cursor.fetchone() is not None

    def get_seen_jules_prompts(self) -> set:
        """Get a set of (repo, prompt) tuples for Jules sessions to prevent duplicate syncs."""
        self.cursor.execute("SELECT github_repo, message FROM threads WHERE source = 'jules' AND author = 'user'")
        return set((row[0] or "", row[1].strip()) for row in self.cursor.fetchall() if row[1])

    def get_message_count(self, identifier: str) -> int:
        """Get the number of messages logged for a given identifier."""
        self.cursor.execute('SELECT COUNT(*) FROM threads WHERE identifier = ?', (identifier,))
        result = self.cursor.fetchone()
        return result[0] if result else 0

    def log_message(self, timestamp: str, source: str, author: str, 
                    message: str, github_repo: Optional[str], identifier: str):
        try:
            self.cursor.execute('''
                INSERT INTO threads (timestamp, source, author, message, github_repo, identifier)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (timestamp, source, author, message, github_repo, identifier))
            self.conn.commit()
        except Exception as e:
            logger.error(f"💾 DB Insertion Failure: {e}")

    def export_to_json(self):
        """Export the threads table to a JSON file."""
        try:
            self.cursor.execute("SELECT * FROM threads")
            rows = self.cursor.fetchall()
            
            column_names = [description[0] for description in self.cursor.description]
            
            result = []
            for row in rows:
                result.append(dict(zip(column_names, row)))
            
            # Group rows by identifier (session/PR)
            from collections import defaultdict
            sessions = defaultdict(list)
            for r in result:
                sessions[r['identifier']].append(r)
                
            dedup_result = []
            seen_jules_prompts = set()
            
            for identifier, messages in sessions.items():
                if not messages:
                    continue
                    
                source = messages[0]['source']
                if source == "jules":
                    # For Jules, deduplicate by the specific repo and the initial prompt
                    repo = messages[0].get('github_repo', '')
                    prompt = next((m['message'] for m in messages if m['author'] == 'user'), None)
                    
                    if prompt and repo:
                        key = (repo, prompt.strip())
                        if key in seen_jules_prompts:
                            continue  # Skip entire session if we have an identical prompt + repo combo
                        seen_jules_prompts.add(key)
                        
                dedup_result.extend(messages)
                
            json_path = os.path.join(os.path.dirname(self.db_path), "conversations.json")
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(dedup_result, f, indent=2, ensure_ascii=False)
                
            logger.info(f"📄 Successfully exported {len(dedup_result)} rows (deduplicated from {len(result)}) to {json_path}")
        except Exception as e:
            logger.error(f"❌ Failed to export to JSON: {e}")

# --- SOURCE HANDLERS ---

class GitHubSource:
    """Syncs PR conversations for jmbish04 using GitHub Search API."""
    def __init__(self, token: str):
        self.username = "jmbish04"
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }

    def sync(self, db: DatabaseManager):
        logger.info(f"🔎 Searching GitHub for merged PRs by {self.username}...")
        query = f"is:pr+is:merged+author:{self.username}"
        
        page = 1
        while True:
            url = f"https://api.github.com/search/issues?q={query}&per_page=100&page={page}"
            try:
                resp = requests.get(url, headers=self.headers)
                resp.raise_for_status()
                items = resp.json().get("items", [])
                
                if not items:
                    break
                    
                for item in items:
                    pr_url = item['html_url']
                    repo_name = item['repository_url'].split("repos/")[-1]
                    pr_number = item['number']
                    
                    # Instead of skipping automatically, check the PR's exact counts via the Pulls API
                    pr_api_url = f"https://api.github.com/repos/{repo_name}/pulls/{pr_number}"
                    pull_resp = requests.get(pr_api_url, headers=self.headers)
                    if pull_resp.status_code == 200:
                        pull_data = pull_resp.json()
                        api_comments = pull_data.get('comments', 0)
                        api_review_comments = pull_data.get('review_comments', 0)
                        
                        # total expected messages = PR body (1) + issue comments + review comments
                        expected_total = 1 + api_comments + api_review_comments
                        
                        db_count = db.get_message_count(pr_url)
                        
                        if db_count >= expected_total:
                            logger.info(f"⏭️ Skipping {repo_name} PR #{pr_number} (Already fully synced: {db_count}/{expected_total})")
                            continue
                        else:
                            logger.info(f"🔨 Syncing PR: {repo_name} #{pr_number} (DB: {db_count}, Expected: {expected_total})")
                    else:
                        # Fallback if the Pulls API fails
                        if db.is_identifier_synced(pr_url):
                            logger.info(f"⏭️ Skipping {repo_name} PR #{pr_number} (Already synced, fallback)")
                            continue
                        logger.info(f"🔨 Syncing NEW PR: {repo_name} - {item.get('title')}")
                    
                    # 1. PR Body
                    db.log_message(item['created_at'], "github_pr", self.username, item.get('body') or "", repo_name, pr_url)

                    # 2. PR Comments (Issue discussions)
                    c_page = 1
                    while True:
                        comments_url = f"https://api.github.com/repos/{repo_name}/issues/{pr_number}/comments?per_page=100&page={c_page}"
                        c_resp = requests.get(comments_url, headers=self.headers)
                        if c_resp.status_code == 200:
                            comments = c_resp.json()
                            if not comments:
                                break
                            for comment in comments:
                                author = comment['user']['login']
                                source = "gemini_code_assist" if "gemini" in author.lower() else "github_comment"
                                db.log_message(comment['created_at'], source, author, comment['body'], repo_name, pr_url)
                            c_page += 1
                        else:
                            break

                    # 3. PR Code Comments (Review comments)
                    rc_page = 1
                    while True:
                        reviews_url = f"https://api.github.com/repos/{repo_name}/pulls/{item['number']}/comments?per_page=100&page={rc_page}"
                        rc_resp = requests.get(reviews_url, headers=self.headers)
                        if rc_resp.status_code == 200:
                            reviews = rc_resp.json()
                            if not reviews:
                                break
                            for review in reviews:
                                author = review['user']['login']
                                source = "gemini_code_assist" if "gemini" in author.lower() else "github_code_comment"
                                # Optionally prepend the file path info to the comment body for context
                                path_info = f"[{review.get('path', 'unknown')}:{review.get('line', '?')}]\n"
                                body = path_info + review.get('body', '')
                                
                                db.log_message(review['created_at'], source, author, body, repo_name, pr_url)
                            rc_page += 1
                        else:
                            break
                        
                page += 1
            except Exception as e:
                logger.error(f"❌ GitHub Extraction Error on page {page}: {e}")
                break

class FastMCPService:
    """Interfaces with the local FastAPI MCP service at http://0.0.0.0:8766."""
    BASE_URL = "http://0.0.0.0:8766/tools"

    def _call_mcp_with_retry(self, url: str, payload: dict, max_retries: int = 3):
        for attempt in range(max_retries):
            try:
                resp = requests.post(url, json=payload, timeout=60)
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                if attempt < max_retries - 1:
                    sleep_time = 2 ** attempt
                    logger.warning(f"⚠️ MCP Call to {url} failed. Retrying in {sleep_time}s...")
                    time.sleep(sleep_time)
                else:
                    logger.error(f"❌ MCP Call to {url} completely failed after {max_retries} attempts: {e}")
                    raise e

    def sync(self, db: DatabaseManager, active_since_days: int = 2):
        logger.info(f"⚡ Connecting to Local FastAPI MCP Service (Lookback: {active_since_days} days)...")
        self._sync_jules(db, active_since_days)
        self._sync_stitch(db, active_since_days)

    def _sync_jules(self, db: DatabaseManager, active_since_days: int):
        logger.info("🤖 Extracting Jules Sessions via paginated scan...")
        page_token = None
        page_size = 5
        total_sessions = 0
        total_activities = 0
        
        # Prevent identical auto-generated push sessions by tracking seen combinations
        seen_prompts = db.get_seen_jules_prompts()

        try:
            while True:
                payload = {
                    "page_size": page_size,
                    "include_activities": True,
                    "active_since_days": active_since_days
                }
                if page_token is not None:
                    payload["page_token"] = page_token

                url = f"{self.BASE_URL}/jules/scan_jules_conversations_active"
                data = self._call_mcp_with_retry(url, payload)
                if not data:
                    break

                metadata = data.get("metadata", {})
                sessions = data.get("sessions", [])
                next_token = metadata.get("next_page_token")

                logger.info(f"📦 Jules batch: {len(sessions)} sessions (token: {page_token or 'start'})")

                for session in sessions:
                    s_id = session.get("name", session.get("sessionId", "unknown"))
                    title = session.get("title", "Untitled")
                    prompt = session.get("prompt", "")
                    source = session.get("source", "Unknown")
                    created = session.get("createdTime", datetime.now().isoformat())
                    activities = session.get("activities", [])
                    total_sessions += 1

                    expected_total = len(activities) + (1 if prompt else 0)
                    db_count = db.get_message_count(s_id)

                    if db_count >= expected_total:
                        continue

                    # Deduplicate: Skip entire session if exact same prompt + repo has been synced
                    if prompt and source:
                        key = (source, prompt.strip())
                        if key in seen_prompts:
                            continue
                        seen_prompts.add(key)

                    logger.info(f"  📝 {title[:60]}... ({len(activities)} activities)")

                    # Log the session prompt itself
                    if prompt:
                        db.log_message(created, "jules", "user", prompt, source, s_id)

                    # Log each activity
                    for act in activities:
                        total_activities += 1
                        act_text = act.get("text") or act.get("description", "")
                        if not act_text:
                            # Check for planGenerated content
                            plan = act.get("planGenerated", {}).get("plan", {})
                            if plan:
                                steps = plan.get("steps", [])
                                act_text = "\n".join(
                                    f"Step {s.get('index', i)}: {s.get('title', '')}"
                                    for i, s in enumerate(steps)
                                )
                        if not act_text:
                            continue

                        db.log_message(
                            act.get("createTime", created),
                            "jules",
                            act.get("originator", "agent"),
                            act_text,
                            source, s_id
                        )

                if next_token is None or not sessions:
                    break

                page_token = next_token

            logger.info(f"✅ Jules scan complete: {total_sessions} sessions, {total_activities} activities processed")
        except Exception as e:
            logger.error(f"❌ Jules Paginated Sync Error: {e}")

    def _sync_stitch(self, db: DatabaseManager, active_since_days: int):
        logger.info("🎨 Extracting Stitch Designs via paginated scan...")
        page_token = 0
        page_size = 10
        total_projects = 0
        total_screens = 0
        total_prompts = 0

        try:
            while True:
                payload = {
                    "page_size": page_size,
                    "active_since_days": active_since_days
                }
                if page_token is not None:
                    payload["page_token"] = page_token

                url = f"{self.BASE_URL}/stitch/scan_stitch_conversations_active"
                data = self._call_mcp_with_retry(url, payload)
                if not data:
                    break

                metadata = data.get("metadata", {})
                projects = data.get("projects", [])
                next_token = metadata.get("next_page_token")
                announced_total = metadata.get("total_projects", "?")

                logger.info(f"📦 Batch {page_token}: {len(projects)} projects (total in account: {announced_total})")

                for project in projects:
                    p_id = project.get("projectId", "unknown")
                    p_name = project.get("projectName", "Untitled")
                    conversations = project.get("conversations", [])
                    total_projects += 1

                    for conv in conversations:
                        screen_name = conv.get("screenName", "Unknown Screen")
                        history = conv.get("history", [])
                        total_screens += 1

                        expected_total = len([e for e in history if e.get("prompt")])
                        identifier = f"stitch/{p_id}/{screen_name}"
                        
                        if db.get_message_count(identifier) >= expected_total:
                            continue

                        for entry in history:
                            prompt = entry.get("prompt", "")
                            if not prompt:
                                continue

                            total_prompts += 1
                            db.log_message(
                                datetime.now().isoformat(),
                                "stitch", "user", prompt, None, identifier
                            )

                    logger.info(f"  🖌️ {p_name}: {len(conversations)} screens")

                if next_token is None or not projects:
                    break

                page_token = next_token

            logger.info(f"✅ Stitch scan complete: {total_projects} projects, {total_screens} screens, {total_prompts} new prompts")
        except Exception as e:
            logger.error(f"❌ Stitch Paginated Sync Error: {e}")

# --- MAIN RUNNER ---

def main():
    parser = argparse.ArgumentParser(description="Sync and export AI conversation patterns")
    parser.add_argument("--export-db", action="store_true", help="Skip network sync and export the existing database to JSON")
    parser.add_argument("--active-since-days", type=int, default=2, help="Number of days to look back for active sessions")
    args = parser.parse_args()

    logger.info("🚀 INITIALIZING CONVERSATION SYNC (Codex Senior Edition)")
    db = DatabaseManager()
    
    if args.export_db:
        logger.info("📦 --export-db flag detected. Skipping network sync.")
        db.export_to_json()
        logger.info("🏁 EXPORT COMPLETE. Database exported to json.")
        return

    # 1. GitHub Sync
    gh_token = TokenManager.get("GH_TOKEN") or TokenManager.get("GITHUB_TOKEN")
    if gh_token:
        GitHubSource(gh_token).sync(db)
    
    # 2. Local MCP FastAPI Sync
    mcp_service = FastMCPService()
    mcp_service.sync(db, active_since_days=args.active_since_days)

    # 3. Export to JSON
    db.export_to_json()

    logger.info("🏁 SYNC COMPLETE. Database and JSON updated at scripts/github/ai_conversation_patterns/")

if __name__ == "__main__":
    main()