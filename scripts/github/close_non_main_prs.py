#!/usr/bin/env python3
"""
Safely close open pull requests that do not target a protected base branch.

Safety rules:
1. Dry-run by default. Use --execute to perform closing.
2. PRs #448 and #449 are hard-protected and can never be closed by this script.
3. Base branches "main" and "master" are protected by default.

The script can fetch PRs directly from the GitHub API or read from a saved JSON file
for offline review/testing. The JSON loader accepts either GitHub API PR objects or
`gh pr list --json ...` output containing baseRefName/headRefName fields.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

PROTECTED_PR_NUMBERS = frozenset({448, 449})
DEFAULT_PROTECTED_BASES = frozenset({"main", "master"})
DEFAULT_API_VERSION = "2022-11-28"


@dataclass(frozen=True)
class PullRequest:
    number: int
    title: str
    url: str
    base_ref: str
    head_ref: str
    state: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Close open pull requests whose base branch is not protected. "
            "Dry-run by default."
        )
    )
    parser.add_argument(
        "--repo",
        default=None,
        help="Repository in owner/repo format. Defaults to the git origin remote.",
    )
    parser.add_argument(
        "--from-file",
        default=None,
        help="Read PR metadata from a JSON file instead of the GitHub API.",
    )
    parser.add_argument(
        "--token-env",
        default="GH_TOKEN",
        help="Environment variable to read the GitHub token from. Default: GH_TOKEN.",
    )
    parser.add_argument(
        "--protect-base",
        action="append",
        default=[],
        help="Additional base branch to protect from closure. Can be repeated.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of open PRs to inspect. Default: all pages.",
    )
    parser.add_argument(
        "--comment",
        default=None,
        help="Optional comment to post before closing each PR. Ignored during dry-run.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually close PRs. Without this flag the script only prints a plan.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print protected/skipped PRs as well as candidates.",
    )
    return parser.parse_args()


def get_repo_from_git() -> str:
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        raise SystemExit(
            "Could not determine repository from git remote. Pass --repo owner/repo."
        ) from exc

    remote = result.stdout.strip()

    https_match = re.search(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/.]+?)(?:\.git)?$", remote)
    if not https_match:
        raise SystemExit(
            f"Could not parse owner/repo from origin remote: {remote!r}. Pass --repo explicitly."
        )

    return f"{https_match.group('owner')}/{https_match.group('repo')}"


def get_token(token_env: str) -> str:
    try:
        result = subprocess.run(
            ["tokens", "show", token_env, "--value-only"],
            check=True,
            capture_output=True,
            text=True,
        )
        token = result.stdout.strip()
        if token:
            return token
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    token = os.getenv(token_env) or os.getenv("GITHUB_TOKEN")
    if token:
        return token.strip()

    raise SystemExit(
        f"No GitHub token found. Set {token_env} or GITHUB_TOKEN, or install the tokens CLI."
    )


def github_request(
    token: str,
    method: str,
    url: str,
    payload: dict | None = None,
) -> tuple[dict | list | None, urllib.response.addinfourl]:
    body = None
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": DEFAULT_API_VERSION,
        "User-Agent": "core-github-api-close-non-main-prs",
    }

    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        response = urllib.request.urlopen(request)
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"GitHub API error for {method} {url}: {exc.code} {error_body}") from exc

    raw = response.read().decode("utf-8")
    if not raw:
        return None, response
    return json.loads(raw), response


def fetch_open_prs(repo: str, token: str, limit: int | None) -> list[PullRequest]:
    owner, repo_name = repo.split("/", 1)
    prs: list[PullRequest] = []
    page = 1

    while True:
        per_page = 100
        if limit is not None:
            remaining = limit - len(prs)
            if remaining <= 0:
                break
            per_page = min(per_page, remaining)

        url = (
            f"https://api.github.com/repos/{owner}/{repo_name}/pulls"
            f"?state=open&per_page={per_page}&page={page}"
        )
        payload, _ = github_request(token, "GET", url)
        if not payload:
            break

        page_items = [normalize_pr(pr) for pr in payload]
        prs.extend(page_items)
        if len(page_items) < per_page:
            break
        page += 1

    return prs


def load_prs_from_file(path: str) -> list[PullRequest]:
    raw = Path(path).read_text(encoding="utf-8")
    parsed = json.loads(raw)
    if not isinstance(parsed, list):
        raise SystemExit(f"{path} must contain a JSON array of pull requests.")
    return [normalize_pr(item) for item in parsed]


def normalize_pr(item: dict) -> PullRequest:
    if "baseRefName" in item:
        base_ref = item["baseRefName"]
        head_ref = item["headRefName"]
        state = item.get("state", "open")
    else:
        base_ref = item["base"]["ref"]
        head_ref = item["head"]["ref"]
        state = item.get("state", "open")

    return PullRequest(
        number=int(item["number"]),
        title=item["title"],
        url=item["url"] if "url" in item else item["html_url"],
        base_ref=base_ref,
        head_ref=head_ref,
        state=state.lower(),
    )


def partition_prs(
    prs: Iterable[PullRequest],
    protected_bases: set[str],
) -> tuple[list[PullRequest], list[tuple[PullRequest, str]]]:
    closable: list[PullRequest] = []
    skipped: list[tuple[PullRequest, str]] = []

    for pr in prs:
        if pr.number in PROTECTED_PR_NUMBERS:
            skipped.append((pr, "hard-protected PR number"))
            continue
        if pr.state != "open":
            skipped.append((pr, f"state={pr.state}"))
            continue
        if pr.base_ref in protected_bases:
            skipped.append((pr, f"protected base={pr.base_ref}"))
            continue
        closable.append(pr)

    return closable, skipped


def print_report(
    repo: str,
    closable: list[PullRequest],
    skipped: list[tuple[PullRequest, str]],
    protected_bases: set[str],
    execute: bool,
    verbose: bool,
) -> None:
    mode = "EXECUTE" if execute else "DRY-RUN"
    print(f"{mode} repo={repo}")
    print(f"Protected PRs: {sorted(PROTECTED_PR_NUMBERS)}")
    print(f"Protected bases: {sorted(protected_bases)}")
    print(f"Closable PRs: {len(closable)}")
    print(f"Skipped PRs: {len(skipped)}")

    if closable:
        print("\nCandidates:")
        for pr in closable:
            print(f"- #{pr.number} base={pr.base_ref} head={pr.head_ref} {pr.title}")

    if verbose and skipped:
        print("\nSkipped:")
        for pr, reason in skipped:
            print(f"- #{pr.number} base={pr.base_ref} head={pr.head_ref} {reason}")


def post_comment(repo: str, token: str, pr_number: int, body: str) -> None:
    owner, repo_name = repo.split("/", 1)
    url = f"https://api.github.com/repos/{owner}/{repo_name}/issues/{pr_number}/comments"
    github_request(token, "POST", url, {"body": body})


def close_pr(repo: str, token: str, pr_number: int) -> None:
    if pr_number in PROTECTED_PR_NUMBERS:
        raise SystemExit(f"Refusing to close hard-protected PR #{pr_number}.")

    owner, repo_name = repo.split("/", 1)
    url = f"https://api.github.com/repos/{owner}/{repo_name}/pulls/{pr_number}"
    github_request(token, "PATCH", url, {"state": "closed"})


def execute_closures(
    repo: str,
    token: str,
    closable: list[PullRequest],
    comment: str | None,
) -> None:
    for pr in closable:
        if pr.number in PROTECTED_PR_NUMBERS:
            raise SystemExit(f"Refusing to close hard-protected PR #{pr.number}.")
        if comment:
            post_comment(repo, token, pr.number, comment)
        close_pr(repo, token, pr.number)
        print(f"Closed #{pr.number} {pr.title}")


def main() -> None:
    args = parse_args()
    repo = args.repo or get_repo_from_git()
    protected_bases = set(DEFAULT_PROTECTED_BASES)
    protected_bases.update(args.protect_base)

    if args.from_file:
        prs = load_prs_from_file(args.from_file)
        token = None
    else:
        token = get_token(args.token_env)
        prs = fetch_open_prs(repo, token, args.limit)

    closable, skipped = partition_prs(prs, protected_bases)
    print_report(repo, closable, skipped, protected_bases, args.execute, args.verbose)

    if not args.execute:
        return

    if token is None:
        raise SystemExit("--execute cannot be used with --from-file.")

    execute_closures(repo, token, closable, args.comment)


if __name__ == "__main__":
    main()
