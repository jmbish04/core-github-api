#!/usr/bin/env python3
"""
seed_project_tasks.py
---------------------
Reads project_tasks.json and generates:
  1. seed_project_tasks.sql  — INSERT OR IGNORE statements for all 4 pm_* tables
  2. Prints wrangler D1 execute commands for local and remote environments

Usage:
  python3 seed_project_tasks.py

Outputs:
  docs/20260329/continuous_improvement/seed_project_tasks.sql

Tables seeded (from backend/src/db/schemas/projects/hierarchy.ts):
  pm_projects  (id, workspace_id, title, description, status, created_at, updated_at)
  pm_epics     (id, project_id, title, description, status, priority, created_at, updated_at)
  pm_stories   (id, epic_id, title, description, status, priority, created_at, updated_at)
  pm_tasks     (id, story_id, title, description, status, priority, "order", created_at, updated_at)

Note: `order` is a reserved SQL keyword — always quoted as "order" in generated SQL.
      created_at / updated_at are stored as INTEGER (unix epoch seconds) per Drizzle mode:'timestamp'.
"""

import json
import os
import time
from datetime import datetime, timezone

# ── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_JSON = os.path.join(SCRIPT_DIR, "project_tasks.json")
OUTPUT_SQL = os.path.join(SCRIPT_DIR, "seed_project_tasks.sql")

# D1 database name (matches wrangler.jsonc binding for DB)
D1_DATABASE_NAME = "core-github-api"

# ── Helpers ──────────────────────────────────────────────────────────────────

def now_unix() -> int:
    """Return current time as unix epoch integer (seconds)."""
    return int(time.time())


def escape(value) -> str:
    """
    Escape a value for safe inclusion in a SQL string literal.
    Returns NULL for None, quoted integer for int, or escaped string.
    `order` column is handled separately via quoting in column lists.
    """
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    # Escape single quotes by doubling them
    return "'" + str(value).replace("'", "''") + "'"


def insert_or_ignore(table: str, columns: list[str], values: list) -> str:
    """Generate a single INSERT OR IGNORE statement."""
    col_list = ", ".join(f'"{c}"' if c == "order" else c for c in columns)
    val_list = ", ".join(escape(v) for v in values)
    return f"INSERT OR IGNORE INTO {table} ({col_list}) VALUES ({val_list});"


# ── Generators ───────────────────────────────────────────────────────────────

def gen_projects(rows: list, ts: int) -> list[str]:
    stmts = []
    for r in rows:
        stmts.append(insert_or_ignore(
            "pm_projects",
            ["id", "workspace_id", "title", "description", "status", "created_at", "updated_at"],
            [
                r["id"],
                r["workspaceId"],
                r["title"],
                r.get("description"),
                r.get("status", "todo"),
                ts,
                ts,
            ]
        ))
    return stmts


def gen_epics(rows: list, ts: int) -> list[str]:
    stmts = []
    for r in rows:
        stmts.append(insert_or_ignore(
            "pm_epics",
            ["id", "project_id", "title", "description", "status", "priority", "created_at", "updated_at"],
            [
                r["id"],
                r["projectId"],
                r["title"],
                r.get("description"),
                r.get("status", "todo"),
                r.get("priority", "medium"),
                ts,
                ts,
            ]
        ))
    return stmts


def gen_stories(rows: list, ts: int) -> list[str]:
    stmts = []
    for r in rows:
        stmts.append(insert_or_ignore(
            "pm_stories",
            ["id", "epic_id", "title", "description", "status", "priority", "created_at", "updated_at"],
            [
                r["id"],
                r["epicId"],
                r["title"],
                r.get("description"),
                r.get("status", "todo"),
                r.get("priority", "medium"),
                ts,
                ts,
            ]
        ))
    return stmts


def gen_tasks(rows: list, ts: int) -> list[str]:
    stmts = []
    for r in rows:
        stmts.append(insert_or_ignore(
            "pm_tasks",
            # "order" is a reserved SQL keyword — quoted in insert_or_ignore()
            ["id", "story_id", "title", "description", "status", "priority", "order", "created_at", "updated_at"],
            [
                r["id"],
                r["storyId"],
                r["title"],
                r.get("description"),
                r.get("status", "todo"),
                r.get("priority", "medium"),
                r.get("order", 0),
                ts,
                ts,
            ]
        ))
    return stmts


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    if not os.path.exists(INPUT_JSON):
        print(f"❌ Input file not found: {INPUT_JSON}")
        raise SystemExit(1)

    with open(INPUT_JSON, encoding="utf-8") as f:
        data = json.load(f)

    ts = now_unix()
    seeded_at = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    projects = data.get("pm_projects", [])
    epics    = data.get("pm_epics", [])
    stories  = data.get("pm_stories", [])
    tasks    = data.get("pm_tasks", [])

    lines: list[str] = []

    lines += [
        "-- ============================================================",
        "-- seed_project_tasks.sql",
        f"-- Generated: {seeded_at}",
        f"-- Source:    project_tasks.json",
        f"-- Tables:    pm_projects, pm_epics, pm_stories, pm_tasks",
        "-- Strategy:  INSERT OR IGNORE (idempotent — safe to re-run)",
        "-- ============================================================",
        "",
        "PRAGMA foreign_keys = OFF;",
        "",
    ]

    # ── pm_projects ──────────────────────────────────────────────────────────
    lines += [
        "-- ──────────────────────────────────────────────",
        f"-- pm_projects  ({len(projects)} rows)",
        "-- ──────────────────────────────────────────────",
    ]
    lines += gen_projects(projects, ts)
    lines += [""]

    # ── pm_epics ─────────────────────────────────────────────────────────────
    lines += [
        "-- ──────────────────────────────────────────────",
        f"-- pm_epics  ({len(epics)} rows)",
        "-- ──────────────────────────────────────────────",
    ]
    lines += gen_epics(epics, ts)
    lines += [""]

    # ── pm_stories ───────────────────────────────────────────────────────────
    lines += [
        "-- ──────────────────────────────────────────────",
        f"-- pm_stories  ({len(stories)} rows)",
        "-- ──────────────────────────────────────────────",
    ]
    lines += gen_stories(stories, ts)
    lines += [""]

    # ── pm_tasks ─────────────────────────────────────────────────────────────
    lines += [
        "-- ──────────────────────────────────────────────",
        f"-- pm_tasks  ({len(tasks)} rows)",
        "-- ──────────────────────────────────────────────",
    ]
    lines += gen_tasks(tasks, ts)
    lines += [""]

    lines += [
        "PRAGMA foreign_keys = ON;",
        "",
        f"-- ✅ Seed complete: {len(projects)} projects, {len(epics)} epics, {len(stories)} stories, {len(tasks)} tasks",
    ]

    sql_output = "\n".join(lines)

    with open(OUTPUT_SQL, "w", encoding="utf-8") as f:
        f.write(sql_output)

    print(f"✅ Wrote {len(lines)} lines → {OUTPUT_SQL}")
    print()
    print("── Apply to D1 ─────────────────────────────────────────────────────")
    print()
    print("  # Local (wrangler dev):")
    print(f"  npx wrangler d1 execute {D1_DATABASE_NAME} --local --file={OUTPUT_SQL}")
    print()
    print("  # Remote (production):")
    print(f"  npx wrangler d1 execute {D1_DATABASE_NAME} --remote --file={OUTPUT_SQL}")
    print()
    print("  # Or via the Cloudflare Dashboard:")
    print("  dash.cloudflare.com → D1 → core-github-api → Console → paste SQL")
    print()
    print(f"── Summary ──────────────────────────────────────────────────────────")
    print(f"  pm_projects : {len(projects)}")
    print(f"  pm_epics    : {len(epics)}")
    print(f"  pm_stories  : {len(stories)}")
    print(f"  pm_tasks    : {len(tasks)}")
    print(f"  Total rows  : {len(projects) + len(epics) + len(stories) + len(tasks)}")


if __name__ == "__main__":
    main()
