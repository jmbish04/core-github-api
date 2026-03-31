import subprocess
import requests
import re
import sys
import os

# --- CONFIGURATION ---
OWNER = 'jmbish04'
REPO = 'jules-n-stitch'
PR_NUMBER = 12

GITHUB_TOKEN_NAME = "GH_TOKEN" 
CF_TOKEN_NAME = "CLOUDFLARE_WRANGLER_API_TOKEN"
CF_ACCOUNT_ID_TOKEN_NAME = "CLOUDFLARE_ACCOUNT_ID"
WORKERS_AI_TOKEN_NAME = "CLOUDFLARE_AI_GATEWAY_TOKEN"


AI_MODEL = "@cf/moonshotai/kimi-k2.5"
# ---------------------

def get_token_from_cli(token_name: str) -> str:
    """Fetches a token using the custom CLI service."""
    try:
        print(f"🔑 Fetching {token_name} via CLI...")
        result = subprocess.run(
            ["tokens", "show", token_name, "--value-only"],
            capture_output=True,
            text=True,
            check=True
        )
        token_match = re.search(r'(gh[pousr]_[a-zA-Z0-9]+|github_pat_[a-zA-Z0-9_]+|[A-Za-z0-9_=-]{30,})', result.stdout)
        if not token_match:
            raise ValueError(f"Could not parse a valid token from CLI output.\nCLI Output: {result.stdout}")
        return token_match.group(1)
    except subprocess.CalledProcessError as e:
        print(f"❌ Error fetching token '{token_name}': {e.stderr.strip() or e.stdout.strip()}")
        sys.exit(1)
    except FileNotFoundError:
        print("❌ Error: The 'tokens' CLI command was not found on your system path.")
        sys.exit(1)

def fetch_cloudflare_docs(url: str) -> str:
    """Fetches Cloudflare documentation natively as Markdown to bypass AI scraping blockers."""
    try:
        # Strip URL fragments (e.g., #gradual-deployments) before fetching
        base_url = url.split('#')[0]
        
        headers = {
            "Accept": "text/markdown",
            "User-Agent": "Jules-Automated-PR-Reviewer/1.0"
        }
        
        res = requests.get(base_url, headers=headers, timeout=10)
        res.raise_for_status()
        
        # We no longer need to strip HTML because Cloudflare gives us pure Markdown!
        # Limit to 3000 chars to avoid blowing up the AI context window
        return res.text.strip()[:3000]
        
    except Exception as e:
        return f"Failed to fetch documentation from {url}: {str(e)}"

def scan_heuristics(logs_text: str):
    """Scans the logs for specific known issues and builds hardcoded instructions."""
    instructions = []
    urls_to_fetch = set()
    docs_content = ""

    logs_lower = logs_text.lower()

    # 1. pnpm approve-builds
    if "pnpm approve-builds" in logs_lower:
        instructions.append("- Run `pnpm approve-builds` and approve all ignored build scripts to fix the build warning.")

    # 2. TSC errors/warnings
    if "warning ts(" in logs_lower or "error ts(" in logs_lower:
        instructions.append("- Fix the TypeScript (tsc) warnings and errors shown in the build logs.")

    # 3. Outdated Wrangler
    if "wrangler" in logs_lower and "update available" in logs_lower:
        instructions.append("- Update wrangler to the latest version by running `pnpm add -D wrangler@latest`.")

    # 4. Lockfile issues
    if "lockfile" in logs_lower and ("error" in logs_lower or "fail" in logs_lower or "frozen" in logs_lower):
        instructions.append("- Delete any existing lockfiles and run `pnpm install --frozen-lockfile` for a clean remediation.")

    # 5. Durable Object Migration URL Extraction
    do_match = re.search(r'Version upload failed.*?Durable Object migration.*?See\s+(https://[^\s]+)', logs_text, re.IGNORECASE | re.DOTALL)
    if do_match:
        url = do_match.group(1).strip('].)')
        urls_to_fetch.add(url)
        instructions.append(f"- The deployment failed due to a Durable Object migration issue (Code 10211). Check `wrangler.jsonc`/`wrangler.toml`. Ensure you are not adding new `new_sqlite_classes` to a new migration tag (like v2) if v1 hasn't even been deployed yet. Fix the migration history based on the documentation below.")

    # 6. Generic "To learn more" URL Extraction
    learn_more_matches = re.finditer(r'To learn more about this error, visit:\s*(https://[^\s]+)', logs_text, re.IGNORECASE)
    for match in learn_more_matches:
        url = match.group(1).strip('].)')
        urls_to_fetch.add(url)
        instructions.append(f"- Fix the deployment error by referencing the material extracted from {url} provided below.")

    # Fetch all extracted URLs
    for url in urls_to_fetch:
        docs_content += f"\n\n### Extracted Doc Content from {url}:\n```markdown\n{fetch_cloudflare_docs(url)}\n```"

    return "\n".join(instructions), docs_content

def analyze_logs_with_ai(logs_text: str, ai_token: str, account_id: str) -> str:
    """Sends the build logs to Cloudflare Workers AI for deeper analysis."""
    print("\n[6/8] 🧠 Sending logs to Workers AI for deeper analysis...")
    
    # Send the last 150 lines (usually contains the actual build/deploy errors + warnings)
    truncated_logs = "\n".join(logs_text.splitlines()[-150:])

    system_prompt = (
        "You are an expert Cloudflare Workers and Astro orchestrator. "
        "Your job is to read failing build logs and write a comprehensive, step-by-step prompt "
        "instructing an autonomous coding agent on exactly how to fix the bugs. "
        "You must explicitly address ALL TypeScript (tsc) errors, ignored scripts, and deployment failures found in the logs. "
        "Do not apologize or use pleasantries. Output ONLY the instructions for the coding agent."
    )
    
    user_prompt = f"Here are the failing build logs:\n\n```\n{truncated_logs}\n```\n\nProvide the exact instructions to fix all issues."

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{AI_MODEL}"
    headers = {
        "Authorization": f"Bearer {ai_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    }

    response = requests.post(url, headers=headers, json=payload)
    if response.status_code == 200:
        res_json = response.json()
        result = res_json.get('result', {})
        if result == {}:
            error_message = f"❌ Workers AI Request Failed: {response.status_code} - {response.text}"
            print(error_message)
            return error_message
        elif "response" in result:
            return result["response"]
        elif "choices" in result and len(result["choices"]) > 0:
            choices = result["choices"][0].get("message", {}).get("content", "Could not parse choices content.")
            if choices == "Could not parse choices content.":
                error_message = f"❌ Workers AI Request Failed: {response.status_code} - {response.text}"
                print(error_message)
                return error_message
            return choices
        else:
            error_message = f"❌ Unexpected AI Response Format: {res_json}"
            print(error_message)
            return error_message
    else:
        error_message = f"❌ Workers AI Request Failed: {response.status_code} - {response.text}"
        print(error_message)
        return error_message

def post_pr_comment(comment_body: str, gh_token: str):
    """Posts a comment to the GitHub PR."""
    print(f"\n[8/8] 💬 Posting comment to PR #{PR_NUMBER}...")
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/issues/{PR_NUMBER}/comments"
    headers = {
        "Authorization": f"Bearer {gh_token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
    }
    response = requests.post(url, headers=headers, json={"body": comment_body})
    if response.status_code == 201:
        print("✅ Successfully posted comment to PR!")
    else:
        print(f"❌ Failed to post comment: {response.status_code} - {response.text}")


def main():
    github_token = get_token_from_cli(GITHUB_TOKEN_NAME)
    cf_token = get_token_from_cli(CF_TOKEN_NAME)
    ai_token = get_token_from_cli(WORKERS_AI_TOKEN_NAME)
    account_id = get_token_from_cli(CF_ACCOUNT_ID_TOKEN_NAME)

    gh_headers = {"Authorization": f"Bearer {github_token}", "Accept": "application/vnd.github.v3+json"}

    print(f"\n[1/8] Fetching PR #{PR_NUMBER} details...")
    pr_res = requests.get(f"https://api.github.com/repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}", headers=gh_headers)
    pr_res.raise_for_status()
    pr_data = pr_res.json()
    
    assignees = pr_data.get("assignees", [])
    assignee_login = assignees[0]["login"] if assignees else "jules"
    head_sha = pr_data["head"]["sha"]

    print(f"✅ Assingee: @{assignee_login}")

    print("\n[2/8] Fetching check runs...")
    checks_res = requests.get(f"https://api.github.com/repos/{OWNER}/{REPO}/commits/{head_sha}/check-runs", headers=gh_headers)
    checks_res.raise_for_status()
    
    cf_check = next((cr for cr in checks_res.json().get("check_runs", []) if "Workers Builds" in cr["name"]), None)
    if not cf_check:
        print("❌ Could not find a Cloudflare Workers Build check run.")
        sys.exit(1)

    conclusion = cf_check.get('conclusion')
    print(f"✅ Analyzed check: \"{cf_check['name']}\" (Conclusion: {conclusion})")

    if conclusion != "failure":
         print("🎉 Build did not fail. Nothing to do!")
         sys.exit(0)

    print("\n[3/8] Extracting Cloudflare IDs...")
    summary = cf_check.get("output", {}).get("summary", "")
    cf_url_match = re.search(r'https://dash\.cloudflare\.com/([a-f0-9]+)/workers/services/view/([^/]+)/production/builds/([a-f0-9\-]+)', summary)
    
    if not cf_url_match:
        print("❌ Could not parse Cloudflare Dashboard URL from summary.")
        sys.exit(1)

    extracted_account_id, script_name, extracted_uuid = cf_url_match.groups()

    print("\n[4/8] Fetching Build Logs from Cloudflare...")
    cf_headers = {"Authorization": f"Bearer {cf_token}", "Content-Type": "application/json"}

    logs_data = None
    r_direct = requests.get(f"https://api.cloudflare.com/client/v4/accounts/{account_id}/builds/builds/{extracted_uuid}/logs", headers=cf_headers)
    
    if r_direct.status_code == 200:
        logs_data = r_direct.json()
    else:
        r_list = requests.get(f"https://api.cloudflare.com/client/v4/accounts/{account_id}/builds/workers/{script_name}/builds", headers=cf_headers)
        if r_list.status_code == 200 and r_list.json().get("result"):
            real_build_uuid = r_list.json()["result"][0].get("build_uuid")
            r_logs2 = requests.get(f"https://api.cloudflare.com/client/v4/accounts/{account_id}/builds/builds/{real_build_uuid}/logs", headers=cf_headers)
            if r_logs2.status_code == 200:
                logs_data = r_logs2.json()

    print("\n[5/8] Parsing Build Logs...")
    parsed_logs_text = ""
    if logs_data and "result" in logs_data:
        for batch in logs_data["result"].get("lines", []):
            for line_data in batch:
                if isinstance(line_data, list) and len(line_data) == 2:
                    parsed_logs_text += line_data[1] + "\n"
                elif isinstance(line_data, dict) and "line" in line_data:
                    parsed_logs_text += line_data["line"] + "\n"
                else:
                    parsed_logs_text += str(line_data) + "\n"
    
    if not parsed_logs_text:
        print("❌ Could not retrieve logs. Aborting AI analysis.")
        sys.exit(1)

    # 1. AI Analysis
    ai_analysis = analyze_logs_with_ai(parsed_logs_text, ai_token, account_id)
    
    # 2. Rule Engine (Heuristics & Docs Fetching)
    print("\n[7/8] 🔍 Running Heuristics & Documentation Fetcher...")
    heuristic_instructions, docs_content = scan_heuristics(parsed_logs_text)

    # 3. Assemble Final Comment
    final_comment = f"@{assignee_login}\n\n{ai_analysis}\n\n"
    
    if heuristic_instructions:
        final_comment += f"### ⚠️ Critical Deployment Flagged Instructions:\n{heuristic_instructions}\n"
    if docs_content:
        final_comment += f"{docs_content}\n\n"
        
    final_comment += f"### Full Build Logs:\n```markdown\n{parsed_logs_text.strip()}\n```"

    post_pr_comment(final_comment, github_token)

if __name__ == "__main__":
    main()