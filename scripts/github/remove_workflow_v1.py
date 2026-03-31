import subprocess
import json
import sys
import time

REPOSITORIES = [
    "jmbish04/core-github-api",
    "jmbish04/antigravity-workflows",
    "jmbish04/antigravity-awesome-skills",
    "jmbish04/better-chatbot",
    "jmbish04/zintrust",
    "jmbish04/memedge",
    "jmbish04/infinitunes",
    "jmbish04/core-template-cfw-assets-astro-shadcn",
    "jmbish04/v0-sdk",
    "jmbish04/inpainter",
    "jmbish04/latest-ai",
    "jmbish04/dataprompt",
    "jmbish04/argus-ai-debate",
    "jmbish04/workspace-agent",
    "jmbish04/sg-condo-advisor",
    "jmbish04/dopamine-hardware",
    "jmbish04/sketchboard",
    "jmbish04/sketchboard-fork",
    "jmbish04/jules-n-stitch",
    "jmbish04/home-remodel-ai",
    "jmbish04/home-remodel-ai-ji",
    "jmbish04/jules-apps-script-sdk",
    "jmbish04/jules-stitch-loop",
    "jmbish04/podcastify-website",
    "jmbish04/browserbase",
    "jmbish04/coding-agent-template",
    "jmbish04/vibe-coding-platform",
    "jmbish04/google-jules-mcp"
]

TARGET_FILE_PATH = ".github/workflows/jules-maintainer.yml"
COMMIT_MESSAGE = "chore: remove jules-maintainer.yml workflow"


def get_token() -> str:
    """Retrieve the GitHub token from the CLI secret manager."""
    result = subprocess.run(
        ["tokens", "show", "GH_TOKEN", "--value-only"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"Error: Could not retrieve GH_TOKEN: {result.stderr.strip()}")
        sys.exit(1)
    token = result.stdout.strip()
    if not token:
        print("Error: GH_TOKEN is empty.")
        sys.exit(1)
    return token


def api_get(token: str, endpoint: str):
    """Make a GET request to the GitHub API."""
    cmd = [
        "curl", "-s",
        "-H", f"Authorization: token {token}",
        "-H", "Accept: application/vnd.github+json",
        f"https://api.github.com/{endpoint}"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def get_default_branch(token: str, repo: str) -> str:
    """Fetch the default branch name for a repository."""
    data = api_get(token, f"repos/{repo}")
    if data and "default_branch" in data:
        return data["default_branch"]
    return None


def get_file_sha(token: str, repo: str, path: str, branch: str) -> str:
    """Fetch the SHA of the target file."""
    data = api_get(token, f"repos/{repo}/contents/{path}?ref={branch}")
    if data and "sha" in data:
        return data["sha"]
    if data and "message" in data:
        print(f"  [debug] get_file_sha: {data['message']}")
    return None


def delete_file(token: str, repo: str, path: str, sha: str, branch: str) -> tuple:
    """Delete the file using curl with the token that has write access."""
    payload = json.dumps({
        "message": COMMIT_MESSAGE,
        "sha": sha,
        "branch": branch
    })

    cmd = [
        "curl", "-s",
        "-X", "DELETE",
        "-w", "\n%{http_code}",
        "-H", f"Authorization: token {token}",
        "-H", "Accept: application/vnd.github+json",
        "-H", "Content-Type: application/json",
        "-d", payload,
        f"https://api.github.com/repos/{repo}/contents/{path}"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    # curl output: response body + newline + http status code
    lines = result.stdout.rsplit("\n", 1)
    body = lines[0] if len(lines) > 1 else ""
    http_code = lines[-1].strip()

    if http_code == "200":
        return True, None
    else:
        # Try to extract a useful error message
        try:
            error_data = json.loads(body)
            msg = error_data.get("message", body)
        except json.JSONDecodeError:
            msg = body
        return False, f"HTTP {http_code}: {msg}"


def main():
    print(f"Starting bulk removal of '{TARGET_FILE_PATH}'...\n")

    # 1. Get token up front (once)
    token = get_token()
    print("[+] Token retrieved successfully.")

    # 2. Verify token scopes
    check_cmd = [
        "curl", "-sI",
        "-H", f"Authorization: token {token}",
        "https://api.github.com/"
    ]
    check_result = subprocess.run(check_cmd, capture_output=True, text=True)
    for line in check_result.stdout.splitlines():
        if "x-oauth-scopes" in line.lower():
            print(f"[+] Token scopes: {line.split(':', 1)[1].strip()}")
            break
    print()

    success_count = 0
    not_found_count = 0
    error_count = 0

    for repo in REPOSITORIES:
        print(f"Processing: {repo}")

        # 1. Get default branch
        branch = get_default_branch(token, repo)
        if not branch:
            print(f"  [-] Skipped: Could not determine default branch.\n")
            not_found_count += 1
            continue

        # 2. Get file SHA on that branch
        sha = get_file_sha(token, repo, TARGET_FILE_PATH, branch)
        if not sha:
            print(f"  [-] Skipped: File not found on '{branch}' branch.\n")
            not_found_count += 1
            continue

        print(f"  [debug] Found SHA: {sha} on branch: {branch}")

        # 3. Delete the file
        success, error_msg = delete_file(token, repo, TARGET_FILE_PATH, sha, branch)

        if success:
            print(f"  [+] Success: File removed from '{branch}'.\n")
            success_count += 1
        else:
            print(f"  [x] Error: {error_msg}\n")
            error_count += 1

        # Small delay to avoid hitting rate limits
        time.sleep(0.5)

    print("--- Summary ---")
    print(f"Successfully removed: {success_count}")
    print(f"Not found / skipped:  {not_found_count}")
    print(f"Errors:               {error_count}")


if __name__ == "__main__":
    main()