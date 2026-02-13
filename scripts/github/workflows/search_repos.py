#!/usr/bin/env python3
import os
import sys
import json
import time
import requests
from datetime import datetime, timezone

TOKEN = os.environ.get('GITHUB_TOKEN')
if not TOKEN:
    print("Error: GITHUB_TOKEN environment variable not set")
    sys.exit(1)

HEADERS = {
    'Accept': 'application/vnd.github+json',
    'Authorization': f'Bearer {TOKEN}',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Antigravity-GitHub-Search'
}

# Resolve the absolute path of the directory containing this script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(SCRIPT_DIR, 'results.json')

def handle_rate_limit(response):
    """Check headers for rate limits and sleep if necessary. Returns True if limited."""
    if response.status_code == 403 and 'X-RateLimit-Remaining' in response.headers:
        remaining = int(response.headers.get('X-RateLimit-Remaining', 1))
        
        # Check standard limits or secondary abuse limits (retry-after)
        if remaining <= 1 or 'retry-after' in response.headers.lower():
            retry_after = int(response.headers.get('Retry-After', 0))
            reset_time = int(response.headers.get('X-RateLimit-Reset', time.time() + 60))
            
            sleep_time = max(retry_after, reset_time - time.time()) + 1
            print(f"⚠️ Rate limit reached. Sleeping for {sleep_time:.0f} seconds before retrying...")
            time.sleep(sleep_time)
            return True
            
    return False

def search_code(query, limit=100):
    """Search GitHub code and return results with automatic retries."""
    url = 'https://api.github.com/search/code'
    params = {
        'q': query,
        'per_page': min(limit, 100)
    }
    
    while True:
        try:
            response = requests.get(url, headers=HEADERS, params=params, timeout=30)
            
            # Must check rate limit BEFORE raise_for_status to prevent exceptions on 403
            if handle_rate_limit(response):
                continue
                
            response.raise_for_status()
            
            # Standard delay to avoid secondary abuse limits
            time.sleep(2) 
            return response.json().get('items', [])
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Error searching: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response body: {e.response.text}")
            return []

def get_repo_details(repo_full_name):
    """Fetch detailed repository metadata with automatic retries."""
    url = f'https://api.github.com/repos/{repo_full_name}'
    
    while True:
        try:
            response = requests.get(url, headers=HEADERS, timeout=30)
            
            if handle_rate_limit(response):
                continue
                
            response.raise_for_status()
            time.sleep(0.5)
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Error fetching details for {repo_full_name}: {e}")
            return None

def main():
    print("=== Searching for Cloudflare Workers + Shadcn projects ===\n")
    
    search_query = 'wrangler tailwind-merge path:package.json'
    
    print(f"📦 Executing Query: {search_query}")
    code_results = search_code(search_query, limit=100)
    print(f"   Found {len(code_results)} code matches")
    
    unique_repo_names = set()
    for item in code_results:
        unique_repo_names.add(item['repository']['full_name'])
        
    print(f"\n✨ Found {len(unique_repo_names)} unique repositories. Fetching metadata...\n")
    
    if not unique_repo_names:
        print(f"⚠️ No repositories found! Writing empty file to {OUTPUT_FILE} to satisfy artifact paths.")
        output = {
            'search_date': datetime.now(timezone.utc).isoformat(),
            'total_repos': 0,
            'repositories': []
        }
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2)
        print("✅ Empty results.json created successfully.")
        return

    repos = {}
    for i, repo_name in enumerate(unique_repo_names, 1):
        print(f"Fetching details for [{i}/{len(unique_repo_names)}]: {repo_name}...")
        repo_data = get_repo_details(repo_name)
        if repo_data:
            repos[repo_name] = {
                'full_name': repo_data.get('full_name'),
                'html_url': repo_data.get('html_url'),
                'description': repo_data.get('description', ''),
                'stargazers_count': repo_data.get('stargazers_count', 0),
                'language': repo_data.get('language', 'Unknown'),
                'pushed_at': repo_data.get('pushed_at', ''),
                'created_at': repo_data.get('created_at', ''),
            }

    print("\n=== 🌟 Top 20 by Stars ===")
    sorted_by_stars = sorted(repos.values(), key=lambda x: x['stargazers_count'], reverse=True)[:20]
    for i, repo in enumerate(sorted_by_stars, 1):
        lang = f"[{repo['language']}]" if repo['language'] else "[Unknown]"
        print(f"{i:2}. {repo['full_name']:40} ⭐ {repo['stargazers_count']:<5} {lang:15} {repo['html_url']}")
    
    output = {
        'search_date': datetime.now(timezone.utc).isoformat(),
        'total_repos': len(repos),
        'repositories': list(repos.values())
    }
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n✅ Full results saved to {OUTPUT_FILE} ({len(repos)} repositories)")

if __name__ == '__main__':
    main()
