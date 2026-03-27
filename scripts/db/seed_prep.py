#!/usr/bin/env python3
"""
scripts/db/seed_prep.py

Prepares seeding files from a data_exports directory produced by reset_d1.py.

Takes the JSON export (produced before the D1 reset) and generates chunked,
limit-aware INSERT SQL files that can be safely applied to fresh D1 instances
via seed_run.py.

Why this step exists:
  - Cloudflare D1 limits: 100 bound parameters/query, ~100 KB SQL statement
  - Large tables (system_logs, webhook_deliveries) are truncated to last N rows
  - All INSERT batches are sized to stay within D1 execute limits
  - Output is separate from migrations/ so wrangler never picks it up accidentally

Usage:
    python3 scripts/db/seed_prep.py --export-dir scripts/db/data_exports/20260327_012345
    python3 scripts/db/seed_prep.py  # uses latest export automatically

D1 Limits (from Cloudflare docs):
  - Max bound parameters per query: 100
  - Max SQL statement length: 100,000 bytes (100 KB) — we limit to 90 KB
  - Max query duration: 30 seconds
  - Safe batch for large INSERT operations: 100 rows max
  - Batch migrations: process 1,000 rows at a time for safety
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

# ─── D1 Limits ────────────────────────────────────────────────────────────────
# Source: https://developers.cloudflare.com/d1/platform/limits/
D1_MAX_PARAMS_PER_QUERY = 100       # Hard CF limit: max bound parameters per query
D1_MAX_STATEMENT_BYTES = 90_000     # Stay under 100 KB hard limit with buffer
D1_SAFE_ROW_BATCH = 100             # Conservative batch size for large tables

# ─── Truncation Limits ────────────────────────────────────────────────────────
# These tables accumulate continuously; only seed the most recent rows.
TABLE_TRUNCATE_LIMITS: dict[str, int] = {
    "system_logs":         2000,   # Keep last 2000 system log rows
    "audit_logs":          1000,   # Keep last 1000 audit entries
    "automation_logs":     1000,   # Keep last 1000 automation runs
    "webhook_deliveries":  500,    # Keep last 500 webhook deliveries
    "health_results":      500,    # Keep last 500 health check results
    "health_runs":         200,    # Keep last 200 health run records
    "request_logs":        1000,   # Keep last 1000 request log entries
}

# Tables that should be fully excluded from seeding (ephemeral / system-managed)
TABLE_EXCLUDE = {
    "_cf_KV",
    "d1_migrations",
    "sqlite_stat1",
}

SEEDS_DIR = Path("scripts/db/seeds")


def prep_table_inserts(table: str, rows: list[dict], limit: int | None) -> list[str]:
    """
    Generates chunked INSERT OR IGNORE SQL statements for a table's rows.

    Respects:
    - D1_MAX_PARAMS_PER_QUERY: splits by column count → max rows per statement
    - D1_MAX_STATEMENT_BYTES: further splits if single statement exceeds limit
    - limit: truncates to the most recent N rows (last N in list = newest)

    Returns a list of SQL statement strings (each safe to execute individually).
    """
    if not rows:
        return []

    # Truncate: keep last N rows (most recent data)
    if limit is not None and len(rows) > limit:
        print(f"    ✂️  {table}: truncating {len(rows)} rows → last {limit}")
        rows = rows[-limit:]

    columns = list(rows[0].keys())
    num_cols = len(columns)

    # D1: max 100 bound parameters per query
    # With N columns → max rows_per_stmt = floor(100 / N), minimum 1
    max_rows_per_stmt = max(1, D1_MAX_PARAMS_PER_QUERY // num_cols)
    # Also cap at D1_SAFE_ROW_BATCH for safety
    rows_per_stmt = min(max_rows_per_stmt, D1_SAFE_ROW_BATCH)

    col_str = ", ".join(f'"{c}"' for c in columns)
    statements = []

    for i in range(0, len(rows), rows_per_stmt):
        batch = rows[i:i + rows_per_stmt]
        value_groups = []

        for row in batch:
            vals = []
            for v in row.values():
                if v is None:
                    vals.append("NULL")
                elif isinstance(v, bool):
                    vals.append("1" if v else "0")
                elif isinstance(v, (int, float)):
                    vals.append(str(v))
                else:
                    escaped = str(v).replace("'", "''")
                    vals.append(f"'{escaped}'")
            value_groups.append(f"({', '.join(vals)})")

        stmt = f'INSERT OR IGNORE INTO "{table}" ({col_str}) VALUES\n  ' + ",\n  ".join(value_groups) + ";"

        # If statement exceeds byte limit, split further into smaller sub-batches
        if len(stmt.encode("utf-8")) > D1_MAX_STATEMENT_BYTES:
            half = max(1, len(batch) // 2)
            statements.extend(prep_table_inserts(table, batch[:half], None))
            statements.extend(prep_table_inserts(table, batch[half:], None))
        else:
            statements.append(stmt)

    return statements


def process_export(json_path: Path, binding: str, output_path: Path) -> int:
    """
    Reads a JSON export file and writes a chunked seed SQL file.
    Returns total number of rows prepared.
    """
    print(f"\n  📂 Processing: {json_path.name}")
    data: dict[str, list[dict]] = json.loads(json_path.read_text(encoding="utf-8"))

    sql_lines = [
        f"-- Seed file: {binding}",
        f"-- Source export: {json_path}",
        f"-- Generated: {datetime.now(timezone.utc).isoformat()}",
        f"-- D1 limits applied: max {D1_MAX_PARAMS_PER_QUERY} params/query, {D1_MAX_STATEMENT_BYTES // 1000}KB/statement",
        "",
        "PRAGMA foreign_keys = OFF;",
        "",
    ]

    total_rows = 0
    skipped_tables = []

    for table, rows in data.items():
        if table in TABLE_EXCLUDE:
            continue
        if not rows:
            skipped_tables.append(f"{table} (empty)")
            continue

        limit = TABLE_TRUNCATE_LIMITS.get(table)
        stmts = prep_table_inserts(table, rows, limit)

        if stmts:
            actual_rows = min(len(rows), limit) if limit else len(rows)
            sql_lines.append(f"-- ── {table} ({actual_rows} rows, {len(stmts)} statements) ──")
            sql_lines.extend(stmts)
            sql_lines.append("")
            total_rows += actual_rows
            print(f"    ✅ {table}: {actual_rows} rows → {len(stmts)} INSERT statements")
        else:
            skipped_tables.append(f"{table} (no data after prep)")

    sql_lines.append("PRAGMA foreign_keys = ON;")

    output_path.write_text("\n".join(sql_lines), encoding="utf-8")

    if skipped_tables:
        print(f"    ℹ️  Skipped: {', '.join(skipped_tables)}")

    print(f"    📄 Seed written → {output_path} ({total_rows} total rows)")
    return total_rows


def find_latest_export() -> Path:
    """Returns the most recent export directory in scripts/db/data_exports/."""
    exports = sorted(Path("scripts/db/data_exports").iterdir(), reverse=True)
    if not exports:
        print("❌ No export directories found in scripts/db/data_exports/")
        print("   Run: pnpm run db:reset  (it exports before deleting)")
        sys.exit(1)
    latest = exports[0]
    print(f"  ℹ️  Auto-detected latest export: {latest}")
    return latest


def main():
    parser = argparse.ArgumentParser(description="Prepare D1 seed files from data_exports")
    parser.add_argument(
        "--export-dir", type=Path,
        help="Path to the export directory (default: auto-detect latest)"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  🌱  D1 Seed Prep")
    print("=" * 60)

    export_dir = args.export_dir or find_latest_export()

    if not export_dir.exists():
        print(f"❌ Export directory not found: {export_dir}")
        sys.exit(1)

    # Create dated seeds output dir
    seeds_dir = SEEDS_DIR / export_dir.name
    seeds_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n  📦 Seed output directory: {seeds_dir}")

    bindings = {
        "core-github-api.json": "DB",
        "core-github-api-webhooks.json": "DB_WEBHOOKS",
    }

    grand_total = 0
    output_files: list[Path] = []

    for filename, binding in bindings.items():
        json_path = export_dir / filename
        if not json_path.exists():
            print(f"  ⚠️  {filename} not found in {export_dir}, skipping.")
            continue

        # Name seed file by binding, not db name, for clarity
        out_name = "DB.seed.sql" if binding == "DB" else "DB_WEBHOOKS.seed.sql"
        output_path = seeds_dir / out_name
        total = process_export(json_path, binding, output_path)
        grand_total += total
        output_files.append(output_path)

    print("\n" + "=" * 60)
    print(f"  ✅ Seed prep complete — {grand_total} total rows across {len(output_files)} files")
    print("=" * 60)
    print(f"""
  Seed files ready:
""" + "\n".join(f"    {f}" for f in output_files) + f"""

  Run seeding now:
    python3 scripts/db/seed_run.py --seeds-dir {seeds_dir}

  ⚠️  Only run after deploy completes so tables exist in fresh D1 instances.
""")


if __name__ == "__main__":
    main()
