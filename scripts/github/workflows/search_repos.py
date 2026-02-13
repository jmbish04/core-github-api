#!/usr/bin/env python3
import os
import json
import time
import requests
import base64
from datetime import datetime, timezone

# --- CONFIGURATION ---
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN') # Required
API_ENDPOINT = os.environ.get('WORKER_API_URL') # Optional: Your Worker URL
RESULTS_FILE = "daily_workers.json"

# Headers for GitHub API
HEADERS = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Worker-Discovery-Bot/1.0'
}

# --- TAGGING LOGIC ---
# We look for these keywords in package.json to auto-label the architecture
TECH_SIGNATURES = {
    "framework": {
        "hono": "Hono",
        "astro": "Astro",
        "remix": "Remix",
        "next": "Next.js",
        "itty-router": "Itty Router",
        "fastapi": "FastAPI (Python)"
    },
    "database": {
        "drizzle-orm": "Drizzle ORM",
        "prisma": "Prisma",
        "kysely": "Kysely",
        "@supabase/supabase-js": "Supabase",
        "mongoose": "MongoDB"
    },
    "infrastructure": {
        "@cloudflare/ai": "Workers AI",
        "@cloudflare/vectorize": "Vectorize",
        "@cloudflare/kv-asset-handler": "KV Assets",
        "toucan-js": "Toucan Telemetry",
        "zod": "Zod Validation"
    },
    "frontend": {
        "clsx": "Tailwind/Shadcn Utils",
        "lucide-react": "Lucide Icons",
        "radix-ui": "Radix UI",
        "react": "React",
        "vue": "Vue"
    }
}

def get_file_content(repo_full_name, path):
    """Fetches raw content of a file from a repo."""
    url = f"https://api.github.com{repo_full_name}/contents/{path}"
    try:
        res = requests.get(url, headers=HEADERS, timeout=5)
        if res.status_code == 200:
            content = base64.b64decode(res.json()['content']).decode('utf-8')
            return content
    except:
        return None
    return None

def analyze_stack(repo_name):
    """Reads package.json to detect tech stack."""
    tags = []
    package_json = get_file_content(repo_name, "package.json")
    
    if not package_json:
        return ["Unknown/Non-JS"]

    try:
        data = json.loads(package_json)
        # Combine deps and devDeps
        all_deps = {**data.get('dependencies', {}), **data.get('devDependencies', {})}
        
        for category, signatures in TECH_SIGNATURES.items():
            for pkg, label in signatures.items():
                if any(k for k in all_deps if pkg in k):
                    tags.append(label)
    except:
        tags.append("Parse Error")
        
    return list(set(tags))

def search_broad_workers():
    """Searches for ANY valid worker config file sorted by recently updated."""
    # We search for 'compatibility_date' which is mandatory in valid wrangler.toml/jsonc
    query = "compatibility_date path:/(wrangler\\.jsonc|wrangler\\.toml)/ sort:indexed"
    url = f"https://api.github.com{query}&per_page=30"
    
    print(f"🌊 Casting wide net with query: {query}")
    res = requests.get(url, headers=HEADERS)
    
    if res.status_code != 200:
        print(f"❌ Error: {res.status_code} {res.text}")
        return []
        
    items = res.json().get('items', [])
    results = []
    seen_repos = set()

    print(f"🔍 Analyzing {len(items)} raw hits...")

    for item in items:
        repo = item['repository']
        name = repo['full_name']
        
        if name in seen_repos or repo.get('fork'): 
            continue
        seen_repos.add(name)
        
        print(f"   👉 Inspecting: {name}...")
        
        # 1. Enrich with Tech Stack
        stack_tags = analyze_stack(name)
        
        # 2. Build Payload
        entry = {
            "name": name,
            "url": repo['html_url'],
            "description": repo.get('description', 'No description'),
            "stars": -1, # Requires separate API call if needed, skipping for speed
            "detected_stack": stack_tags,
            "config_file": item['name'],
            "discovered_at": datetime.now(timezone.utc).isoformat()
        }
        results.append(entry)
        time.sleep(1) # Respect rate limits

    return results

def main():
    if not GITHUB_TOKEN:
        print("⚠️  Error: GITHUB_TOKEN not set.")
        return

    # 1. Run Search
    new_discoveries = search_broad_workers()
    
    # 2. Save to Disk
    with open(RESULTS_FILE, 'w') as f:
        json.dump(new_discoveries, f, indent=2)
    print(f"\n✅ Saved {len(new_discoveries)} repos to {RESULTS_FILE}")

    # 3. Post to your Worker API (Optional)
    if API_ENDPOINT and new_discoveries:
        print(f"📤 Posting to {API_ENDPOINT}...")
        try:
            res = requests.post(API_ENDPOINT, json={"payload": new_discoveries})
            print(f"   Status: {res.status_code}")
        except Exception as e:
            print(f"   Failed to post: {e}")

if __name__ == "__main__":
    main()
