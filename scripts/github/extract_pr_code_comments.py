import os
import sys
import re
import json
import requests
from urllib.parse import urlparse

def get_github_token():
    """Retrieves the GitHub token from the environment variable."""
    token = os.getenv("MY_GITHUB_TOKEN")
    if not token:
        print("Error: MY_GITHUB_TOKEN environment variable is not set.", file=sys.stderr)
        sys.exit(1)
    return token

def parse_pr_url(url):
    """Parses the GitHub PR URL to extract owner, repo, and pull_number."""
    parsed_url = urlparse(url)
    path_parts = parsed_url.path.strip("/").split("/")
    
    if len(path_parts) < 4 or path_parts[2] != "pull":
        print("Error: Invalid GitHub Pull Request URL.", file=sys.stderr)
        print("Expected format: https://github.com/OWNER/REPO/pull/NUMBER", file=sys.stderr)
        sys.exit(1)
        
    return {
        "owner": path_parts[0],
        "repo": path_parts[1],
        "pull_number": path_parts[3]
    }

def extract_suggestion(body):
    """Attempts to extract a code suggestion block from the comment body."""
    # GitHub suggestions are wrapped in ```suggestion ... ``` blocks
    pattern = r"```suggestion\r?\n(.*?)\r?\n```"
    match = re.search(pattern, body, re.DOTALL)
    if match:
        return match.group(1)
    return None

def fetch_comments(owner, repo, pull_number, token):
    """Fetches review comments from the GitHub API, handling pagination."""
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}/comments"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    
    all_comments = []
    page = 1
    
    while True:
        response = requests.get(url, headers=headers, params={"page": page, "per_page": 100})
        
        if response.status_code != 200:
            print(f"Error fetching comments: {response.status_code}", file=sys.stderr)
            print(response.text, file=sys.stderr)
            sys.exit(1)
            
        data = response.json()
        if not data:
            break
            
        all_comments.extend(data)
        page += 1
        
    return all_comments

def format_comment(comment):
    """Maps a GitHub API comment object to the requested JSON schema."""
    return {
        "id": comment.get("id"),
        "path": comment.get("path"),
        "line": comment.get("line"), # Nullable in API, maps to Zod nullable
        "start_line": comment.get("start_line"), # Optional/Nullable
        "original_line": comment.get("original_line"), # Useful for outdated comments
        "body": comment.get("body"),
        "diff_hunk": comment.get("diff_hunk"),
        "suggestion": extract_suggestion(comment.get("body", "")),
        "user": {
            "login": comment.get("user", {}).get("login"),
            "avatar_url": comment.get("user", {}).get("avatar_url")
        },
        "created_at": comment.get("created_at"),
        "html_url": comment.get("html_url")
    }

def main():
    if len(sys.argv) != 2:
        print("Usage: python3 extract_comments.py <PR_URL>", file=sys.stderr)
        sys.exit(1)

    pr_url = sys.argv[1]
    token = get_github_token()
    pr_details = parse_pr_url(pr_url)
    
    print(f"Fetching comments for {pr_details['owner']}/{pr_details['repo']} PR #{pr_details['pull_number']}...", file=sys.stderr)
    
    raw_comments = fetch_comments(pr_details['owner'], pr_details['repo'], pr_details['pull_number'], token)
    formatted_comments = [format_comment(c) for c in raw_comments]
    
    # Print JSON to stdout
    print(json.dumps(formatted_comments, indent=2))

if __name__ == "__main__":
    main()