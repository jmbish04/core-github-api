#!/usr/bin/env python3
"""
Bulk-close stale/superseded PRs for jmbish04/core-github-api.

Run: python3 scripts/github/cleanup_stale_prs.py
Add --dry-run to preview without closing.
"""

import subprocess
import sys
import json

DRY_RUN = "--dry-run" in sys.argv

REPO = "jmbish04/core-github-api"

# ─── Tier 1: Close immediately (stale / superseded / duplicate / no-op) ───
TIER1_CLOSE = {
    448: "Superseded — all changes were absorbed into checkpoint PRs #449/#450 and built upon by #452/#453.",
    18:  "Closing stale PR (4+ months old) — architecture has evolved significantly since this was opened.",
    20:  "Closing stale PR (4+ months old) — frontend has been rebuilt multiple times since.",
    23:  "Closing stale PR (4+ months old) — lock file has diverged far from this snapshot.",
    25:  "Closing stale PR (3+ months old) — Jules integration has been rearchitected.",
    36:  "Closing stale PR — cleanup changes were superseded by recent checkpoint merges.",
    48:  "Closing stale PR — sandbox-sdk exports have been reworked in recent merges.",
    50:  "Closing stale PR — likely absorbed into recent checkpoint merges or no longer applies.",
    51:  "Closing stale PR — likely absorbed into recent checkpoint merges or no longer applies.",
    52:  "Closing stale PR — likely absorbed into recent checkpoint merges or no longer applies.",
    53:  "Closing stale PR — likely absorbed into recent checkpoint merges or no longer applies.",
    54:  "Closing stale PR — likely absorbed into recent checkpoint merges or no longer applies.",
    55:  "Closing stale PR — likely absorbed into recent checkpoint merges or no longer applies.",
    56:  "Closing stale PR — likely absorbed into recent checkpoint merges or no longer applies.",
    57:  "Closing stale PR — duplicate of #54 (deduplicateQuestions optimization).",
    63:  "Closing stale PR — likely absorbed into recent checkpoint merges or no longer applies.",
    64:  "Closing — this PR was a no-op ('No changes required: PR comment was a summary').",
    66:  "Closing stale PR — D1 schema and migrations have been reworked in recent merges.",
}

# ─── Tier 2: Close with review note ───
TIER2_CLOSE = {
    39:  "Closing — Honi-based doc generator approach likely superseded by current architecture. Reopen if still desired.",
    42:  "Closing — Vibe Coding Orchestration likely absorbed into sentinel/stitch-loop work (#452/#453). Reopen if still needed.",
    44:  "Closing — retrofit agent functionality likely absorbed into recent sentinel work. Reopen if still needed.",
    47:  "Closing — MCP Accept header fix is 3+ weeks old, likely stale against current code. Reopen if the bug persists.",
    59:  "Closing — Jules sessions frontend/agent work likely absorbed into #452 sentinel/learning frontend. Reopen if still needed.",
    60:  "Closing — supervisor WebSocket optimization likely absorbed into recent merges. Reopen if still needed.",
    65:  "Closing — duplicate of #60 (supervisor WebSocket broadcasting optimization).",
}

# ─── Tier 3: Also closing (per owner request) ───
TIER3_CLOSE = {
    58:  "Closing — Podcast Studio feature PR is 3+ weeks stale. Reopen if this feature is still on the roadmap.",
    67:  "Closing — Agent Scheduling refactor is 3+ weeks stale and likely superseded by recent architectural changes. Reopen if still needed.",
    68:  "Closing — Scale-to-zero hibernation PR is 2+ weeks stale. Reopen if this feature is still planned.",
    72:  "Closing — Drizzle schema consolidation has been superseded by the migration rework in recent checkpoint merges (#449/#450).",
    336: "Closing — Concurrent file fetching optimization is 2+ weeks stale. Reopen if the perf improvement is still needed.",
}


def close_pr(pr_number: int, comment: str):
    """Close a PR with a comment."""
    if DRY_RUN:
        print(f"  [DRY RUN] Would close PR #{pr_number}: {comment}")
        return True

    # Add comment
    result = subprocess.run(
        ["gh", "pr", "comment", str(pr_number), "--repo", REPO, "--body", comment],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  ERROR commenting on #{pr_number}: {result.stderr.strip()}")
        return False

    # Close PR
    result = subprocess.run(
        ["gh", "pr", "close", str(pr_number), "--repo", REPO],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  ERROR closing #{pr_number}: {result.stderr.strip()}")
        return False

    print(f"  Closed PR #{pr_number}")
    return True


def delete_branch(pr_number: int):
    """Delete the remote branch for a closed PR."""
    if DRY_RUN:
        return

    # Get branch name
    result = subprocess.run(
        ["gh", "pr", "view", str(pr_number), "--repo", REPO, "--json", "headRefName", "-q", ".headRefName"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        return

    branch = result.stdout.strip()
    if not branch or branch in ("main", "master"):
        return

    result = subprocess.run(
        ["gh", "api", f"repos/{REPO}/git/refs/heads/{branch}", "-X", "DELETE"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        print(f"    Deleted branch: {branch}")


def main():
    mode = "DRY RUN" if DRY_RUN else "LIVE"
    print(f"\n{'='*60}")
    print(f"  PR Cleanup Script ({mode})")
    print(f"{'='*60}\n")

    # Tier 1
    print(f"--- Tier 1: Closing {len(TIER1_CLOSE)} stale/superseded PRs ---")
    for pr, comment in sorted(TIER1_CLOSE.items()):
        close_pr(pr, comment)
        delete_branch(pr)

    # Tier 2
    print(f"\n--- Tier 2: Closing {len(TIER2_CLOSE)} PRs (review recommended) ---")
    for pr, comment in sorted(TIER2_CLOSE.items()):
        close_pr(pr, comment)
        delete_branch(pr)

    # Tier 3
    print(f"\n--- Tier 3: Closing {len(TIER3_CLOSE)} remaining PRs ---")
    for pr, comment in sorted(TIER3_CLOSE.items()):
        close_pr(pr, comment)
        delete_branch(pr)

    total_closed = len(TIER1_CLOSE) + len(TIER2_CLOSE) + len(TIER3_CLOSE)
    print(f"\n{'='*60}")
    print(f"  Summary: {total_closed} PRs closed")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
