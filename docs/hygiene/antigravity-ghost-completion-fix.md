# Antigravity Ghost Completion Fix

**Affects:** Antigravity IDE v1.20.5 / v1.20.6 / v1.21.x
**Workspace:** `core-github-api` (any repo using `git worktree`)
**Symptom:** Agent panel dings immediately with no response or error; Agent menu commands missing from Command Palette

---

## What Happened

Every time Antigravity's language server started, it called `GetAgentScripts` to register Agent menu commands. That call hit a fatal error in its internal git library:

```
core.repositoryformatversion does not support extension: worktreeconfig
```

Because `GetAgentScripts` failed, the Agent Service never registered its commands — producing the "Ghost Completion" (instant ding, blank response).

### Root Cause

`.git/config` had two conflicting settings:

```ini
[core]
    repositoryformatversion = 0   ← version 0 does NOT support extensions

[extensions]
    worktreeConfig = true         ← requires version 1
```

`repositoryformatversion = 0` is git's default for repositories that don't use any extensions. The `worktreeConfig` extension was added automatically when Claude Code created linked worktrees (`.claude/worktrees/`), but git never bumped the format version. Antigravity's Go-based git library enforces the spec strictly and throws a hard error rather than ignoring the mismatch.

### Why the Context also Mattered

While the git mismatch was the primary blocker, the workspace had additional context-overload risk factors that were compounding the instability:

- `.claude/worktrees/` — two full 37 MB repo clones being indexed
- `pnpm-lock.yaml` / `package-lock.json` — 900+ KB of plain-text noise
- `.agent/rules/` — a recursive bootstrap loop where `000-bootstrap.md` and `000-core-directive.md` each mandated reading all rules on every turn
- Duplicate rules (`ai-providers.md` / `ai-provider-standards.md`, etc.) inflating per-turn token budgets

---

## The Fix (definitive — three steps)

### 1. `.antigravityignore` — context overload prevention

Created at repo root. Stops the RAG indexer from ingesting worktrees, lock files, build artifacts, and large reference docs. See the file for the full pattern list.

### 2. `.agent/rules/` — collapsed recursive bootstrap loop

- Merged `000-bootstrap.md` + `000-core-directive.md` into a single lazy-load directive
- Deleted duplicate rules: `ai-providers.md`, `alerts.md`, `cloudflare-stack.md`
- Added `hygiene-standards.md` to enforce future rule hygiene

### 3. Git config — the actual crash fix

**Remove `extensions.worktreeConfig` entirely:**

```bash
git config --unset extensions.worktreeConfig
```

> **Why not just bump repositoryformatversion to 1?**
> This was tried first and worked briefly. The issue is that Apple Git 2.39.x
> (shipped with Xcode CLI tools) has an inconsistent code path: even with
> `repositoryformatversion=1`, the Antigravity language server's Go-based git
> library still throws the error when reading workspace info after a
> `Developer: Reload Window` clears the extension host cache and forces a
> fresh git config read. The only reliable fix is removing the extension.
>
> The `config.worktree` files the extension enables only contain a redundant
> `hooksPath` pointing back to the main `.git/hooks` directory, so removing
> the extension has no functional effect on worktrees.

### 4. Kill stale language server processes

The servers have the bad config cached in memory. After step 3:

```bash
kill $(ps aux | grep "language_server_macos_arm" | grep -v grep | awk '{print $2}')
```

Antigravity auto-respawns. Then: `Cmd+Shift+P` → **Developer: Reload Window** (**once only** — a second reload spawns a new server before the first has settled, re-triggering the cycle).

### One-command fix

```bash
python3 scripts/fix-antigravity-git.py --fix --kill
```

---

## How to Detect It Early

Open **Antigravity → Help → Show Logs** (or run `Antigravity: Show Extension Logs` from the Command Palette) and search for:

```
repositoryformatversion does not support extension
```

If you see this line, run the fix script. Check manually with:

```bash
git config extensions.worktreeConfig   # should return nothing (not set)
```

---

## Prevention

1. After any `git worktree add` operation, immediately run:
   ```bash
   git config --unset extensions.worktreeConfig
   ```
   Git adds this extension automatically when creating worktrees. Remove it every time.
2. Keep `.antigravityignore` up to date whenever large generated files or new worktree paths are added.
3. Run `python3 scripts/fix-antigravity-git.py` to audit and self-heal automatically.

---

## Quick Reference

| Symptom | Check | Fix |
|---------|-------|-----|
| Agent dings instantly, no response | `git config extensions.worktreeConfig` returns `true` | `git config --unset extensions.worktreeConfig` |
| Agent menu missing from Command Palette | Extension logs show `worktreeconfig` error | Same as above + kill language server PIDs |
| Slow/sluggish completions | Large files being indexed | Update `.antigravityignore` |
| Per-turn token budget exhausted | `.agent/rules/` has recursive mandates | Consolidate bootstrap rules to lazy-load |
