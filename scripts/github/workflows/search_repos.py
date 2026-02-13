#!/usr/bin/env python3
import os
import sys
import json
import time
import requests
from datetime import datetime, timezone

# --- CONFIGURATION ---
TOKEN = os.environ.get('GITHUB_TOKEN')
if not TOKEN:
    print("Error: GITHUB_TOKEN environment variable not set")
    sys.exit(1)

HEADERS = {
    'Accept': 'application/vnd.github+json',
    'Authorization': f'Bearer {TOKEN}',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Cloudflare-Worker-Hunter'
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(SCRIPT_DIR, 'results.json')

# --- TARGET QUERIES ---
# We use multiple specific queries to bypass GitHub's search limits and find "the good stuff"
QUERIES = [
    # 1. Astro + Cloudflare + Shadcn (The modern stack)
    '"@astrojs/cloudflare" "tailwind-merge" path:package.json',
    # 2. Next.js on Pages + Shadcn
    '"@cloudflare/next-on-pages" "lucide-react" path:package.json',
    # 3. Newest Worker standard (jsonc) + AI
    '"@cloudflare/ai" path:wrangler.jsonc',
    # 4. Pure Workers + Drizzle (signals high quality)
    '"drizzle-orm" "wrangler" path:package.json'
]

def handle_rate_limit(response):
    if response.status_code == 403:
        retry_after = int(response.headers.get('Retry-After', 60))
        print(f"⚠️ Rate limit. Sleeping {retry_after}s...")
        time.sleep(retry_after)
        return True
    return False

def search_github(query):
    url = 'https://api.github.com/search/code'
    params = {'q': query, 'per_page': 50}
    try:
        res = requests.get(url, headers=HEADERS, params=params, timeout=30)
        if handle_rate_limit(res): return search_github(query)
        res.raise_for_status()
        return res.json().get('items', [])
    except Exception as e:
        print(f"❌ Search Error: {e}")
        return []

def get_repo_meta(full_name):
    url = f'https://api.github.com/repos/{full_name}'
    res = requests.get(url, headers=HEADERS)
    return res.json() if res.status_code == 200 else None

def main():
    print("🚀 Starting Edge Tech Discovery...\n")
    unique_repos = {}

    for q in QUERIES:
        print(f"🔍 Searching: {q}")
        items = search_github(q)
        for item in items:
            name = item['repository']['full_name']
            if name not in unique_repos:
                unique_repos[name] = item['repository']
        time.sleep(2) # Prevent secondary rate limits

    print(f"\n✨ Found {len(unique_repos)} candidates. Refining metadata...")
    
    final_list = []
    for i, (name, base_data) in enumerate(unique_repos.items(), 1):
        meta = get_repo_meta(name)
        if meta and not meta.get('fork'): # Filter out noise/forks
            final_list.append({
                'name': name,
                'url': meta['html_url'],
                'stars': meta['stargazers_count'],
                'desc': meta['description'],
                'updated': meta['pushed_at']
            })
            print(f" ✅ [{i}] Collected: {name}")
        time.sleep(0.2)

    # Sort by most recently active
    final_list.sort(key=lambda x: x['updated'], reverse=True)

    output = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'count': len(final_list),
        'repos': final_list
    }

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n🎉 Done! Saved {len(final_list)} repos to {OUTPUT_FILE}")

if __name__ == '__main__':
    main()
