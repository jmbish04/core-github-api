#!/usr/bin/env python3
import os
import json
import time
import requests
import base64
import urllib.parse
from datetime import datetime, timezone

# --- CONFIGURATION ---
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN')
# Your Worker Endpoint for daily sync and deduplication
WORKER_API_URL = os.environ.get('WORKER_API_URL') 

# Define output path for GitHub Actions artifact
# This ensures it saves to the repo root for the YAML to find
ROOT_DIR = os.environ.get('GITHUB_WORKSPACE', os.getcwd())
OUTPUT_FILE = os.path.join(ROOT_DIR, 'results.json')

HEADERS = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Cloudflare-Worker-Discovery-Bot/1.0'
}

# Tags to search for in package.json
TECH_SIGNATURES = {
    "framework": {"hono": "Hono", "astro": "Astro", "remix": "Remix", "next": "Next.js"},
    "database": {"drizzle-orm": "Drizzle", "prisma": "Prisma", "pg": "Postgres"},
    "ai": {"@cloudflare/ai": "Workers AI", "vectorize": "Vectorize", "openai": "OpenAI"},
    "ui": {"shadcn": "Shadcn", "tailwind": "Tailwind", "radix-ui": "Radix"}
}

def analyze_stack(repo_name):
    """Enriches the repo by checking its package.json dependencies."""
    tags = []
    url = f"https://api.github.com{repo_name}/contents/package.json"
    try:
        res = requests.get(url, headers=HEADERS, timeout=5)
        if res.status_code == 200:
            content = base64.b64decode(res.json()['content']).decode('utf-8')
            data = json.loads(content)
            all_deps = {**data.get('dependencies', {}), **data.get('devDependencies', {})}
            for category, sigs in TECH_SIGNATURES.items():
                for pkg, label in sigs.items():
                    if any(pkg in k for k in all_deps):
                        tags.append(label)
    except:
        pass
    return list(set(tags)) if tags else ["Standard Worker"]

def get_already_registered_repos():
    """
    FUTURE DEDUPLICATION:
    Queries your Worker API to get a list of repos we've already found.
    """
    # if WORKER_API_URL:
    #     try:
    #         print("Checking Worker API for previously registered repos...")
    #         res = requests.get(f"{WORKER_API_URL}/list-repos", timeout=10)
    #         if res.status_code == 200:
    #             return set(res.json().get('repo_names', []))
    #     except Exception as e:
    #         print(f"⚠️ Could not fetch existing list: {e}")
    return set()

def search_broad_workers():
    """Searches for ANY valid worker config file using correct URL formatting."""
    
    # 1. Define and Encode Query
    raw_query = 'compatibility_date path:/(wrangler\\.jsonc|wrangler\\.toml)/'
    encoded_query = urllib.parse.quote(raw_query)
    
    # 2. Correct URL Construction
    url = f"https://api.github.com{encoded_query}&sort=indexed&order=desc&per_page=100"
    
    print(f"🌊 Casting wide net: {raw_query}")
    
    # Get previously found repos for deduplication
    already_found = get_already_registered_repos()
    
    try:
        res = requests.get(url, headers=HEADERS, timeout=30)
        if res.status_code != 200:
            print(f"❌ Error: {res.status_code} - {res.text}")
            return []
            
        items = res.json().get('items', [])
        results = []
        seen_now = set()

        print(f"🔍 Analyzing {len(items)} raw hits...")

        for item in items:
            repo = item['repository']
            name = repo['full_name']
            
            # Skip if: duplicate in this run, already in your DB, or is a fork
            if name in seen_now or name in already_found or repo.get('fork'): 
                continue
            
            seen_now.add(name)
            print(f"   👉 New Find: {name}")
            
            stack_tags = analyze_stack(name)
            
            results.append({
                "name": name,
                "url": repo['html_url'],
                "description": repo.get('description', 'No description'),
                "detected_stack": stack_tags,
                "config_file": item['name'],
                "discovered_at": datetime.now(timezone.utc).isoformat()
            })
            time.sleep(1) # Safety delay for secondary rate limits

        return results

    except Exception as e:
        print(f"❌ Fatal Request Error: {e}")
        return []

def main():
    if not GITHUB_TOKEN:
        print("❌ Error: GITHUB_TOKEN not set")
        return

    discoveries = search_broad_workers()
    
    # Save to artifact file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(discoveries, f, indent=2)
    
    print(f"\n✅ Found {len(discoveries)} new repos. Saved to {OUTPUT_FILE}")

    # OPTIONAL: Post to your Worker API immediately
    # if WORKER_API_URL and discoveries:
    #     requests.post(f"{WORKER_API_URL}/ingest", json={"repos": discoveries})

if __name__ == '__main__':
    main()
