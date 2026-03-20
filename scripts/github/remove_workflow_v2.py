import subprocess
import json
import sys
import argparse
import os

OWNER = "jmbish04"
COMMIT_MESSAGE = "chore: remove automated workflow file"

def check_gh_cli_installed():
    """Verify that the GitHub CLI is installed and authenticated."""
    try:
        result = subprocess.run(
            ["gh", "auth", "status"], 
            capture_output=True, 
            text=True
        )
        if result.returncode != 0:
            print("Error: GitHub CLI is not authenticated. Please run 'gh auth login'.")
            sys.exit(1)
    except FileNotFoundError:
        print("Error: GitHub CLI ('gh') is not installed or not in PATH.")
        sys.exit(1)

def find_repositories(file_path: str) -> list:
    """Search GitHub for repositories containing the specific file."""
    # gh search code requires a search term in addition to qualifiers.
    # Use the filename as the search term, and pass owner/path as flags.
    
    filename = os.path.basename(file_path)  # e.g., "jules-maintainer.yml"
    
    # Use --owner and --filename flags instead of embedding in the query string.
    # --filename matches the exact filename (not a substring of the path).
    cmd = [
        "gh", "search", "code",
        filename,               # search term (required by the API)
        "--owner", OWNER,
        "--filename", filename, # restricts to this exact filename
        "--json", "repository,path",
        "-L", "100"
    ]
    
    print(f"Executing search for '{file_path}' in owner '{OWNER}'...")
    print(f"Command: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"Error searching GitHub:\n{result.stderr}")
        sys.exit(1)
        
    try:
        data = json.loads(result.stdout)
        repos = set()
        target_clean_path = file_path.lstrip('/')
        
        for item in data:
            repo_name = item.get("repository", {}).get("nameWithOwner")
            item_path = item.get("path")
            
            # Strictly filter in Python to ensure the exact full path matches
            if repo_name and item_path == target_clean_path:
                repos.add(repo_name)
                
        return sorted(list(repos))
    except json.JSONDecodeError:
        print("Error: Failed to parse GitHub CLI search output.")
        sys.exit(1)


def get_file_sha(repo: str, path: str) -> str:
    """Fetch the SHA of the target file via the GitHub REST API."""
    cmd = [
        "gh", "api", 
        f"repos/{repo}/contents/{path}"
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        return None
        
    try:
        data = json.loads(result.stdout)
        return data.get("sha")
    except json.JSONDecodeError:
        return None

def delete_file(repo: str, path: str, sha: str) -> bool:
    """Delete the file using the GitHub REST API."""
    cmd = [
        "gh", "api",
        "--method", "DELETE",
        "-H", "Accept: application/vnd.github+json",
        f"repos/{repo}/contents/{path}",
        "-f", f"message={COMMIT_MESSAGE}",
        "-f", f"sha={sha}"
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0

def main():
    parser = argparse.ArgumentParser(description="Bulk remove a specific file across multiple GitHub repositories.")
    parser.add_argument("file_path", help="The path of the file to search for and remove (e.g., .github/workflows/jules-maintainer.yml)")
    args = parser.parse_args()
    
    target_file = args.file_path.lstrip('/')
    
    check_gh_cli_installed()
    
    repos = find_repositories(target_file)
    
    if not repos:
        print(f"No repositories found containing the exact file path: '{target_file}'")
        sys.exit(0)
        
    print(f"\nFound {len(repos)} repositories containing '{target_file}':")
    for r in repos:
        print(f"  - {r}")
        
    print(f"\nAre you sure you want to PERMANENTLY delete '{target_file}' from these {len(repos)} repositories?")
    confirm = input("Type 'yes' to proceed: ")
    
    if confirm.lower() not in ['y', 'yes']:
        print("Operation cancelled by user.")
        sys.exit(0)
        
    print(f"\nStarting bulk removal...\n")
    
    success_count = 0
    not_found_count = 0
    error_count = 0
    
    for repo in repos:
        print(f"Processing: {repo}")
        
        sha = get_file_sha(repo, target_file)
        
        if not sha:
            print(f"  [-] Skipped: File not found at exact path or inaccessible.\n")
            not_found_count += 1
            continue
            
        success = delete_file(repo, target_file, sha)
        
        if success:
            print(f"  [+] Success: File removed.\n")
            success_count += 1
        else:
            print(f"  [x] Error: Failed to delete the file.\n")
            error_count += 1

    print("--- Summary ---")
    print(f"Successfully removed: {success_count}")
    print(f"Not found / skipped:  {not_found_count}")
    print(f"Errors:               {error_count}")

if __name__ == "__main__":
    main()