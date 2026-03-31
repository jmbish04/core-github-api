#!/usr/bin/env python3
"""
fix-antigravity-git.py

Diagnoses and fixes the Antigravity IDE "Ghost Completion" bug caused by a
git config issue: extensions.worktreeConfig=true conflicts with how Apple
Git 2.39.x validates extensions in the language server context.

The definitive fix is to unset extensions.worktreeConfig entirely. The
per-worktree config.worktree files it enables only contain a redundant
hooksPath that points back to the main hooks directory anyway.

Optionally kills stale language server processes so Antigravity picks up the
corrected config immediately without requiring a Reload Window.

Usage:
    python3 scripts/fix-antigravity-git.py           # diagnose only
    python3 scripts/fix-antigravity-git.py --fix      # apply the git config fix
    python3 scripts/fix-antigravity-git.py --fix --kill  # fix + kill stale servers
    python3 scripts/fix-antigravity-git.py --fix --kill --dry-run  # preview only
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
from typing import Dict, List, Optional


# ── helpers ──────────────────────────────────────────────────────────────────

def run(cmd: List[str], cwd: Optional[str] = None) -> tuple:
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def git_config_get(key: str, repo_root: str) -> Optional[str]:
    code, out, _ = run(["git", "config", "--local", key], cwd=repo_root)
    return out if code == 0 else None


def git_config_set(key: str, value: str, repo_root: str) -> bool:
    code, _, err = run(["git", "config", key, value], cwd=repo_root)
    if code != 0:
        print("  ERROR setting {}: {}".format(key, err))
    return code == 0


def git_config_unset(key: str, repo_root: str) -> bool:
    code, _, err = run(["git", "config", "--unset", key], cwd=repo_root)
    # exit code 5 = key not set, which is fine
    if code not in (0, 5):
        print("  ERROR unsetting {}: {}".format(key, err))
        return False
    return True


def find_repo_root() -> str:
    code, out, _ = run(["git", "rev-parse", "--show-toplevel"])
    if code != 0:
        print("ERROR: Not inside a git repository.")
        sys.exit(1)
    return out


def get_language_server_pids() -> List[int]:
    code, out, _ = run(["pgrep", "-f", "language_server_macos_arm"])
    if code != 0 or not out:
        return []
    return [int(p) for p in out.splitlines() if p.strip().isdigit()]


def get_worktrees(repo_root: str) -> List[Dict]:
    code, out, _ = run(["git", "worktree", "list", "--porcelain"], cwd=repo_root)
    if code != 0:
        return []
    worktrees: List[Dict] = []
    current: Dict = {}
    for line in out.splitlines():
        if line.startswith("worktree "):
            if current:
                worktrees.append(current)
            current = {"path": line[9:]}
        elif line.startswith("branch "):
            current["branch"] = line[7:]
        elif line.startswith("HEAD "):
            current["head"] = line[5:]
    if current:
        worktrees.append(current)
    return worktrees


# ── diagnosis ────────────────────────────────────────────────────────────────

def diagnose(repo_root: str) -> Dict:
    fmt_version = git_config_get("core.repositoryformatversion", repo_root)
    worktree_ext = git_config_get("extensions.worktreeConfig", repo_root)
    worktrees = get_worktrees(repo_root)
    ls_pids = get_language_server_pids()

    issues = []

    # Primary trigger: worktreeConfig extension present (any version)
    # Apple Git 2.39.x / Antigravity language server crashes on this regardless
    # of repositoryformatversion value.
    if worktree_ext == "true":
        issues.append(
            "CRITICAL: extensions.worktreeConfig=true is present "
            "→ Antigravity language server crashes on GetAgentScripts. "
            "Fix: unset extensions.worktreeConfig"
        )
    elif fmt_version == "0" and worktree_ext is not None:
        issues.append(
            "CRITICAL: repositoryformatversion=0 + extensions present "
            "→ Antigravity language server will crash on GetAgentScripts"
        )

    if fmt_version is None:
        issues.append("WARNING: Could not read core.repositoryformatversion")

    if len(worktrees) > 1:
        claude_worktrees = [w for w in worktrees if ".claude/worktrees" in w.get("path", "")]
        if claude_worktrees:
            issues.append(
                "INFO: {} Claude Code worktree(s) found — "
                "ensure .antigravityignore excludes .claude/worktrees/".format(len(claude_worktrees))
            )

    antigravityignore = os.path.join(repo_root, ".antigravityignore")
    if not os.path.exists(antigravityignore):
        issues.append("WARNING: .antigravityignore not found — context overload risk")
    else:
        with open(antigravityignore) as f:
            content = f.read()
        missing = [p for p in [".claude/worktrees/", "pnpm-lock.yaml", "node_modules/"]
                   if p not in content]
        if missing:
            issues.append("WARNING: .antigravityignore missing patterns: {}".format(", ".join(missing)))

    return {
        "repo_root": repo_root,
        "fmt_version": fmt_version,
        "worktree_ext": worktree_ext,
        "worktrees": worktrees,
        "ls_pids": ls_pids,
        "issues": issues,
        "needs_git_fix": worktree_ext == "true",
    }


def print_diagnosis(d: Dict) -> None:
    print("\n" + "=" * 60)
    print("  Antigravity Git Config Diagnostic")
    print("=" * 60)
    print("  Repo:                      {}".format(d["repo_root"]))
    print("  repositoryformatversion:   {}".format(d["fmt_version"]))
    print("  extensions.worktreeConfig: {}".format(d["worktree_ext"] or "(not set) ✓"))
    print("  Worktrees:                 {}".format(len(d["worktrees"])))
    print("  Language server PIDs:      {}".format(d["ls_pids"] or "none found"))
    print()

    if d["issues"]:
        print("  Issues found:")
        for issue in d["issues"]:
            prefix = "  [!]" if issue.startswith("CRITICAL") else "  [-]"
            print("{}  {}".format(prefix, issue))
    else:
        print("  [✓] No issues detected.")

    print()


# ── fixes ────────────────────────────────────────────────────────────────────

def apply_git_fix(repo_root: str, dry_run: bool = False) -> bool:
    print("  Fix 1: unsetting extensions.worktreeConfig")
    if dry_run:
        print("  (dry-run — no changes made)")
        return True
    ok = git_config_unset("extensions.worktreeConfig", repo_root)
    if ok:
        remaining = git_config_get("extensions.worktreeConfig", repo_root)
        if remaining is None:
            print("  Verified: extensions.worktreeConfig is gone")
        else:
            print("  WARNING: extensions.worktreeConfig still set to: {}".format(remaining))
            return False

    # Also ensure [extensions] section is fully gone if empty
    fmt = git_config_get("core.repositoryformatversion", repo_root)
    print("  repositoryformatversion remains: {}".format(fmt))
    return ok


def kill_language_servers(pids: List[int], dry_run: bool = False) -> None:
    if not pids:
        print("  No language server processes found.")
        return

    print("  Killing {} language server process(es): {}".format(len(pids), pids))
    if dry_run:
        print("  (dry-run — no processes killed)")
        return

    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
            print("  Sent SIGTERM to PID {}".format(pid))
        except ProcessLookupError:
            print("  PID {} already gone".format(pid))
        except PermissionError:
            print("  Permission denied for PID {}".format(pid))

    print()
    print("  Antigravity will auto-respawn fresh language server(s).")
    print("  Then run: Cmd+Shift+P → Developer: Reload Window (ONCE only)")
    print("  WARNING: Do not run Reload Window a second time — it re-triggers the")
    print("  bug cycle by spawning a new server before the first has fully settled.")


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Diagnose and fix the Antigravity Ghost Completion git config bug."
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Unset extensions.worktreeConfig to fix the GetAgentScripts crash",
    )
    parser.add_argument(
        "--kill",
        action="store_true",
        help="Kill stale language server processes after fixing (requires --fix)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making any changes",
    )
    args = parser.parse_args()

    if args.kill and not args.fix:
        print("ERROR: --kill requires --fix")
        sys.exit(1)

    repo_root = find_repo_root()
    diagnosis = diagnose(repo_root)
    print_diagnosis(diagnosis)

    if not args.fix and not args.dry_run:
        if diagnosis["needs_git_fix"]:
            print("  Run with --fix to apply the git config correction.")
            print("  Run with --fix --kill to also restart language servers.")
        sys.exit(0 if not diagnosis["needs_git_fix"] else 1)

    if diagnosis["needs_git_fix"] or args.dry_run:
        ok = apply_git_fix(repo_root, dry_run=args.dry_run)
        if not ok:
            print("  Fix failed — check git permissions on .git/config")
            sys.exit(1)
        print()

    if args.kill:
        kill_language_servers(diagnosis["ls_pids"], dry_run=args.dry_run)
    elif diagnosis["ls_pids"]:
        print(
            "  NOTE: {} language server(s) still running with old config (PIDs: {}).".format(
                len(diagnosis["ls_pids"]), diagnosis["ls_pids"]
            )
        )
        print("  Re-run with --kill to restart them, or reload the Antigravity window.")

    if not diagnosis["needs_git_fix"] and not args.dry_run:
        print("  [✓] Git config looks correct — no fix needed.")
        print("  If Agent commands are still missing, run with --kill to force-restart servers.")


if __name__ == "__main__":
    main()
