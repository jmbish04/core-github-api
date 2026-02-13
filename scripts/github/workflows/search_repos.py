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

def check_rate_limit(response):
    """Handle GitHub API rate limiting gracefully."""
    if 'X-RateLimit-Remaining' in response.headers:
        remaining = int(response.headers['X-RateLimit-Remaining'])
        # Search API has a strict 10 req/min limit
        if remaining <= 1:
            reset_time = int(response.headers.get('X-RateLimit-Reset', time.time() + 60))
            sleep_time = max(reset_time - time.time(), 0) + 1
            print(f"⚠️ Rate limit reached. Sleeping for {sleep_time:.0f} seconds...")
            time.sleep(sleep_time)
        else:
            # Add a small 1-second delay between requests to prevent triggering abuse mechanisms
            time.sleep(1)

def search_code(query, limit=100):
    """Search GitHub code and return results."""
    url = 'https://api.github.com/search/code'
    params = {
        'q': query,
        'per_page': min(limit, 100)
    }
    
    try:
        response = requests.get(url, headers=HEADERS, params=params, timeout=30)
        response.raise_for_status()
        check_rate_limit(response)
        return response.json().get('items', [])
    except requests.exceptions.RequestException as e:
        print(f"Error searching: {e}")
        return []

def get_repo_details(repo_full_name):
    """Fetch detailed repository metadata (stars, language, dates)."""
    url = f'https://api.github.com/repos/{repo_full_name}'
    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()
        check_rate_limit(response)
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching details for {repo_full_name}: {e}")
        return None

def main():
    print("=== Searching for Cloudflare Workers + Shadcn projects ===\n")
    
    # We search package.json for both backend (Cloudflare) and frontend (Shadcn utilities) dependencies
    print("📦 Searching for projects with wrangler and shadcn-related dependencies...")
    search_query = '("wrangler" OR "@cloudflare/workers-types") AND ("lucide-react" OR "clsx" OR "tailwind-merge") path:package.json'
    code_results = search_code(search_query, limit=100)
    print(f"   Found {len(code_results)} code matches")
    
    # Extract unique repository IDs
    unique_repo_names = set()
    for item in code_results:
        unique_repo_names.add(item['repository']['full_name'])
        
    print(f"\n✨ Found {len(unique_repo_names)} unique repositories. Fetching metadata...\n")
    
    if not unique_repo_names:
        print("No repositories found!")
        return

    # Fetch full repository metadata to get accurate stars and dates
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

    # Sort by stars
    print("\n=== 🌟 Top 20 by Stars ===")
    sorted_by_stars = sorted(repos.values(), key=lambda x: x['stargazers_count'], reverse=True)[:20]
    for i, repo in enumerate(sorted_by_stars, 1):
        lang = f"[{repo['language']}]" if repo['language'] else "[Unknown]"
        print(f"{i:2}. {repo['full_name']:40} ⭐ {repo['stargazers_count']:<5} {lang:15} {repo['html_url']}")
    
    # Sort by last updated
    print("\n=== 📅 Top 20 by Last Updated ===")
    sorted_by_updated = sorted(repos.values(), key=lambda x: x['pushed_at'], reverse=True)[:20]
    for i, repo in enumerate(sorted_by_updated, 1):
        pushed = repo['pushed_at'][:10] if repo['pushed_at'] else 'Unknown'
        print(f"{i:2}. {repo['full_name']:40} ⭐ {repo['stargazers_count']:<5} Updated: {pushed}  {repo['html_url']}")
    
    # Save results to JSON
    output = {
        'search_date': datetime.now(timezone.utc).isoformat(),
        'total_repos': len(repos),
        'repositories': list(repos.values())
    }
    
    with open('results.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n✅ Full results saved to results.json ({len(repos)} repositories)")

if __name__ == '__main__':
    main()
