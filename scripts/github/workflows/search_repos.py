#!/usr/bin/env python3
import os
import sys
import json
import requests
from datetime import datetime

TOKEN = os.environ.get('GITHUB_TOKEN')
if not TOKEN:
    print("Error: GITHUB_TOKEN environment variable not set")
    sys.exit(1)

HEADERS = {
    'Accept': 'application/vnd.github+json',
    'Authorization': f'Bearer {TOKEN}',
    'User-Agent': 'GitHub-Action-Search'
}

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
        return response.json().get('items', [])
    except requests.exceptions.RequestException as e:
        print(f"Error searching: {e}")
        return []

def main():
    print("=== Searching for shadcn in Cloudflare Workers projects ===\n")
    
    # Search for wrangler.toml
    print("📦 Searching for shadcn in repos with wrangler.toml...")
    toml_results = search_code('shadcn path:wrangler.toml', limit=100)
    print(f"   Found {len(toml_results)} code matches")
    
    # Search for wrangler.jsonc
    print("📦 Searching for shadcn in repos with wrangler.jsonc...")
    jsonc_results = search_code('shadcn path:wrangler.jsonc', limit=100)
    print(f"   Found {len(jsonc_results)} code matches")
    
    # Combine and deduplicate by repository
    repos = {}
    for item in toml_results + jsonc_results:
        repo = item['repository']
        repo_id = repo['full_name']
        if repo_id not in repos:
            repos[repo_id] = {
                'full_name': repo['full_name'],
                'html_url': repo['html_url'],
                'description': repo.get('description', ''),
                'stargazers_count': repo.get('stargazers_count', 0),
                'language': repo.get('language', ''),
                'pushed_at': repo.get('pushed_at', ''),
                'created_at': repo.get('created_at', ''),
            }
    
    print(f"\n✨ Found {len(repos)} unique repositories\n")
    
    if not repos:
        print("No repositories found!")
        return
    
    # Sort by stars
    print("=== 🌟 Top 20 by Stars ===")
    sorted_by_stars = sorted(repos.values(), key=lambda x: x['stargazers_count'], reverse=True)[:20]
    for i, repo in enumerate(sorted_by_stars, 1):
        lang = f"[{repo['language']}]" if repo['language'] else ""
        print(f"{i:2}. {repo['full_name']:40} ⭐ {repo['stargazers_count']:5} {lang:15} {repo['html_url']}")
    
    # Sort by last updated
    print("\n=== 📅 Top 20 by Last Updated ===")
    sorted_by_updated = sorted(repos.values(), key=lambda x: x['pushed_at'], reverse=True)[:20]
    for i, repo in enumerate(sorted_by_updated, 1):
        pushed = repo['pushed_at'][:10] if repo['pushed_at'] else 'Unknown'
        print(f"{i:2}. {repo['full_name']:40} ⭐ {repo['stargazers_count']:5} Updated: {pushed}  {repo['html_url']}")
    
    # Save results to JSON
    output = {
        'search_date': datetime.utcnow().isoformat(),
        'total_repos': len(repos),
        'repositories': list(repos.values())
    }
    
    with open('results.json', 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n✅ Full results saved to results.json ({len(repos)} repositories)")

if __name__ == '__main__':
    main()
