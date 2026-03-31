#!/usr/bin/env python3
"""
scripts/db/seed_run.py

Applies seed files produced by seed_prep.py to fresh D1 instances.

Executes each seed SQL file via `wrangler d1 execute --remote --file`.
Applies statements individually when bulk execution fails, with D1-specific
error detection, clear diagnostics, and retry logic.

Usage:
    python3 scripts/db/seed_run.py --seeds-dir scripts/db/seeds/20260327_012345
    python3 scripts/db/seed_run.py  # uses latest seeds dir automatically

D1 Errors handled (from https://developers.cloudflare.com/d1/observability/debug-d1/):
  - D1_EXEC_ERROR      : syntax or execution error
  - D1_TYPE_ERROR      : type mismatch (e.g. undefined → non-null column)
  - D1_COLUMN_NOTFOUND : column not found (schema mismatch)
  - DB overloaded      : too many queued requests
  - CPU time limit     : query too slow (split into smaller chunks)
  - Memory limit       : too much data loaded at once
  - Max DB size        : 10 GB limit exceeded
  - No SQL statements  : empty/malformed file

After seeding:
  1. Run the health check: POST /api/health/run
  2. Check webhook_deliveries and system_logs row counts
  3. Compare with export metadata to confirm seeding success
"""

import argparse
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from datetime import datetime

SEEDS_DIR = Path("scripts/db/seeds")

# ─── D1 Error Keyword → Human Explanation + Fix ──────────────────────────────
D1_ERROR_HINTS = {
    "D1_EXEC_ERROR": (
        "D1 SQL execution error — likely a syntax issue or a column/table that "
        "doesn't exist in the new schema. The seed SQL may reference a column "
        "that was renamed or dropped during the migration.\n"
        "→ FIX: Check that pnpm run migrate:remote:all completed before running "
        "this seed. If the column was intentionally removed, update seed_prep.py "
        "TABLE_EXCLUDE to skip this table."
    ),
    "D1_TYPE_ERROR": (
        "D1 type mismatch — a value in the seed does not match the column type. "
        "The most common cause is NULL being provided for a NOT NULL column.\n"
        "→ FIX: Check the failing INSERT statement and verify all NOT NULL columns "
        "have values. Update seed_prep.py to filter out rows with missing required fields."
    ),
    "D1_COLUMN_NOTFOUND": (
        "D1 column not found — the seed SQL references a column that no longer "
        "exists in the new schema. This can happen after a migration that dropped "
        "or renamed a column.\n"
        "→ FIX: Add this table to TABLE_EXCLUDE in seed_prep.py and re-run "
        "seed_prep.py to regenerate the seed files without this table."
    ),
    "overloaded": (
        "D1 database is overloaded — too many requests queued. This usually means "
        "statements are being sent too fast.\n"
        "→ FIX: seed_run.py will automatically add delays. If this persists, "
        "wait 60 seconds and retry: python3 scripts/db/seed_run.py"
    ),
    "cpu time limit": (
        "D1 query exceeded CPU time limit — the INSERT is touching too many rows "
        "at once.\n"
        "→ FIX: Reduce D1_SAFE_ROW_BATCH in seed_prep.py (try 25 rows) and "
        "re-run seed_prep.py to regenerate smaller statement batches."
    ),
    "memory limit": (
        "D1 isolate exceeded memory limit — a query loaded too much data at once.\n"
        "→ FIX: Reduce D1_SAFE_ROW_BATCH in seed_prep.py (try 10 rows) and "
        "re-run seed_prep.py, then retry seeding."
    ),
    "exceeded maximum db size": (
        "D1 database has exceeded its 10 GB storage limit.\n"
        "→ FIX: Delete old data from the D1 instance before seeding, or reduce "
        "TABLE_TRUNCATE_LIMITS in seed_prep.py to seed fewer rows."
    ),
    "no sql statements": (
        "D1 received an empty or malformed SQL input.\n"
        "→ FIX: Check that the seed file is not empty. Re-run seed_prep.py to "
        "regenerate the seed files."
    ),
    "account has exceeded": (
        "Your Cloudflare account has exceeded D1's maximum account storage limit.\n"
        "→ FIX: Delete unused D1 databases from your Cloudflare dashboard, or "
        "contact Cloudflare to increase your storage limit."
    ),
}


def classify_d1_error(stderr_or_stdout: str) -> str | None:
    """
    Scans error output for known D1 error keywords.
    Returns a formatted instructive message, or None if no known error found.
    """
    lower = stderr_or_stdout.lower()
    for keyword, hint in D1_ERROR_HINTS.items():
        if keyword.lower() in lower:
            return (
                f"\n{'─' * 60}\n"
                f"⚠️  Known D1 Error Detected: [{keyword}]\n"
                f"{'─' * 60}\n"
                f"{hint}\n"
                f"{'─' * 60}\n"
                f"Raw error output:\n{stderr_or_stdout}\n"
                f"{'─' * 60}"
            )
    return None


def run_wrangler_file(binding: str, sql_file: Path, dry_run: bool = False) -> bool:
    """
    Executes a SQL file against a D1 binding via wrangler.
    Returns True on success.
    """
    cmd = [
        "wrangler", "d1", "execute", binding,
        "--remote", "--file", str(sql_file)
    ]
    if dry_run:
        print(f"  [DRY-RUN] Would run: {' '.join(cmd)}")
        return True

    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0, result


def execute_statement(binding: str, sql: str, retries: int = 2) -> tuple[bool, str]:
    """
    Executes a single SQL statement against a D1 binding via wrangler.
    Retries on transient overload errors.
    Returns (success, error_message).
    """
    for attempt in range(retries + 1):
        result = subprocess.run(
            ["wrangler", "d1", "execute", binding, "--remote", "--command", sql],
            capture_output=True, text=True
        )

        output = result.stderr + result.stdout

        if result.returncode == 0 and "error" not in output.lower():
            return True, ""

        # Detect transient overload — worth retrying
        if "overloaded" in output.lower() and attempt < retries:
            wait = 5 * (attempt + 1)
            print(f"    ⏳ D1 overloaded — waiting {wait}s before retry {attempt + 1}/{retries}...")
            time.sleep(wait)
            continue

        return False, output

    return False, "Max retries exceeded"


def apply_seed_file(binding: str, seed_file: Path) -> dict:
    """
    Applies a seed SQL file to a D1 binding.

    Strategy:
    1. Try bulk execution via --file (fastest)
    2. If that fails, parse individual INSERT statements and apply one-by-one
       with D1 error classification and instructive messages

    Returns a report dict.
    """
    print(f"\n  🌱 Seeding {binding} ← {seed_file.name}")
    report = {
        "binding": binding,
        "file": str(seed_file),
        "statements_total": 0,
        "statements_ok": 0,
        "statements_failed": 0,
        "errors": [],
    }

    content = seed_file.read_text(encoding="utf-8")

    # Parse out individual statements (split on ';')
    raw_stmts = [s.strip() for s in content.split(";") if s.strip()]
    # Filter out comments and PRAGMA (wrangler handles PRAGMA fine but let's be explicit)
    executable = [
        s for s in raw_stmts
        if s and not s.startswith("--") and not s.upper().startswith("PRAGMA")
    ]
    report["statements_total"] = len(executable)

    if not executable:
        print(f"  ℹ️  No executable statements in {seed_file.name}")
        return report

    # ── Strategy 1: Bulk file execution ────────────────────────────────────
    print(f"  📤 Bulk execute: {len(executable)} statements via --file...")
    bulk_result = subprocess.run(
        ["wrangler", "d1", "execute", binding, "--remote", "--file", str(seed_file)],
        capture_output=True, text=True
    )
    bulk_output = bulk_result.stderr + bulk_result.stdout

    if bulk_result.returncode == 0 and "error" not in bulk_output.lower():
        print(f"  ✅ Bulk seed succeeded ({len(executable)} statements)")
        report["statements_ok"] = len(executable)
        return report

    # ── Strategy 2: Statement-by-statement fallback ────────────────────────
    print(f"  ⚠️  Bulk execution failed — switching to statement-by-statement mode")
    hint = classify_d1_error(bulk_output)
    if hint:
        print(hint)
    else:
        print(f"  Raw bulk error:\n{bulk_output[:1000]}")

    # Check if error is immediately fatal (schema mismatch etc.)
    fatal_keywords = ["D1_COLUMN_NOTFOUND", "D1_TYPE_ERROR", "no sql statements", "exceeded maximum db size"]
    if any(kw.lower() in bulk_output.lower() for kw in fatal_keywords):
        print(f"\n  ❌ Fatal D1 error detected — aborting statement-by-statement fallback.")
        print(f"  Fix the issue above and re-run seed_prep.py before retrying.")
        report["errors"].append(bulk_output)
        report["statements_failed"] = len(executable)
        return report

    ok, failed = 0, 0
    last_table = ""

    for i, stmt in enumerate(executable):
        # Extract table name for progress display
        if 'INSERT OR IGNORE INTO "' in stmt:
            tbl = stmt.split('INSERT OR IGNORE INTO "')[1].split('"')[0]
            if tbl != last_table:
                print(f"    → seeding table: {tbl} ...")
                last_table = tbl

        success, error_msg = execute_statement(binding, stmt + ";")

        if success:
            ok += 1
        else:
            failed += 1
            hint = classify_d1_error(error_msg)
            err_context = (
                hint if hint
                else (
                    f"\n{'─' * 60}\n"
                    f"❌ Statement {i + 1}/{len(executable)} failed on {binding}\n"
                    f"Statement (first 200 chars): {stmt[:200]}\n"
                    f"Error: {error_msg[:500]}\n"
                    f"{'─' * 60}"
                )
            )
            print(err_context)
            report["errors"].append(err_context)

            # Abort on fatal errors mid-stream
            if any(kw.lower() in error_msg.lower() for kw in fatal_keywords):
                print(f"\n  ❌ Fatal error mid-stream — stopping seeding for {binding}.")
                print(f"  {failed} statements failed, {ok} succeeded before abort.")
                break

        # Small delay every 50 statements to avoid overloading D1
        if (i + 1) % 50 == 0:
            time.sleep(0.5)

    report["statements_ok"] = ok
    report["statements_failed"] = failed

    if failed == 0:
        print(f"  ✅ Statement-by-statement seeding complete ({ok} OK)")
    else:
        print(f"  ⚠️  Seeding partial: {ok} OK, {failed} failed")

    return report


def find_latest_seeds() -> Path:
    """Returns the most recent seeds directory."""
    seeds = sorted([d for d in SEEDS_DIR.iterdir() if d.is_dir()], reverse=True)
    if not seeds:
        print("❌ No seed directories found in scripts/db/seeds/")
        print("   Run: python3 scripts/db/seed_prep.py  (first)")
        sys.exit(1)
    latest = seeds[0]
    print(f"  ℹ️  Auto-detected latest seeds: {latest}")
    return latest


def main():
    parser = argparse.ArgumentParser(description="Apply D1 seed files to fresh instances")
    parser.add_argument(
        "--seeds-dir", type=Path,
        help="Path to the seeds directory (default: auto-detect latest)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be done without executing"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  🚀  D1 Seed Runner")
    print("=" * 60)

    seeds_dir = args.seeds_dir or find_latest_seeds()

    if not seeds_dir.exists():
        print(f"❌ Seeds directory not found: {seeds_dir}")
        sys.exit(1)

    seed_files = {
        "DB.seed.sql": "DB",
        "DB_WEBHOOKS.seed.sql": "DB_WEBHOOKS",
    }

    all_reports = []
    start = datetime.now()

    for filename, binding in seed_files.items():
        seed_file = seeds_dir / filename
        if not seed_file.exists():
            print(f"\n  ℹ️  {filename} not found in {seeds_dir} — skipping {binding}")
            continue

        if args.dry_run:
            print(f"\n  [DRY-RUN] Would seed {binding} from {seed_file}")
            continue

        report = apply_seed_file(binding, seed_file)
        all_reports.append(report)

    # ── Summary ────────────────────────────────────────────────────────────
    elapsed = (datetime.now() - start).seconds
    print("\n" + "=" * 60)
    print("  📊 Seeding Summary")
    print("=" * 60)

    total_ok = sum(r["statements_ok"] for r in all_reports)
    total_failed = sum(r["statements_failed"] for r in all_reports)

    for r in all_reports:
        status = "✅" if r["statements_failed"] == 0 else "⚠️"
        print(f"  {status} {r['binding']}: {r['statements_ok']} OK, {r['statements_failed']} failed")

    print(f"\n  Total: {total_ok} statements applied, {total_failed} failed ({elapsed}s)")

    if total_failed > 0:
        print("""
  ⚠️  Some statements failed. Review the errors above.
  Common fixes:
    1. Re-run without changes to retry transient overload errors
    2. Update seed_prep.py TABLE_EXCLUDE for schema-mismatched tables
    3. Reduce D1_SAFE_ROW_BATCH in seed_prep.py and re-run seed_prep.py
    4. Verify deploy completed: wrangler d1 execute DB --remote --command "SELECT count(*) FROM sqlite_master WHERE type='table';"
""")
        sys.exit(1)
    else:
        print("""
  ✅ All rows seeded successfully!

  Verify:
    wrangler d1 execute DB --remote --command "SELECT count(*) as c FROM system_logs;"
    wrangler d1 execute DB_WEBHOOKS --remote --command "SELECT count(*) as c FROM webhook_deliveries;"

  Or run the health check:
    curl -X POST https://core-github-api.hacolby.workers.dev/api/health/run
""")


if __name__ == "__main__":
    main()
