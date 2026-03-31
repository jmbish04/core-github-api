#!/usr/bin/env python3
"""
seed_project_tasks.py
---------------------
Reads project_tasks.json and generates INSERT OR IGNORE SQL for the
canonical backlog tables: epics, stories, tasks.

pm_* tables are the legacy structure — this script maps them to the
consolidated backlog hierarchy (zero new tables, zero new columns):

  pm_projects → repositories (already exists: id='github:jmbish04/core-github-api')
  pm_epics    → epics        (repo_id = REPO_ID, INTEGER timestamps)
  pm_stories  → stories      (repo_id = REPO_ID, parent_id = epic_id, INTEGER timestamps)
  pm_tasks    → tasks        (repo_id = REPO_ID, parent_id = story_id, position = order,
                               kanban_column = 'backlog', status = 'todo')

Usage:
  python3 seed_project_tasks.py

Outputs:
  docs/20260329/continuous_improvement/seed_project_tasks.sql

Tables seeded (canonical backlog tables):
  epics         (id, repo_id, title, description, status, priority, created_at, updated_at)
  stories       (id, repo_id, parent_id, title, description, status, priority, created_at, updated_at)
  tasks         (id, repo_id, parent_id, title, description, status, priority, position, kanban_column)

Note: epics/stories use INTEGER (unix epoch) timestamps.
      tasks uses TEXT (CURRENT_TIMESTAMP default) — created_at/updated_at omitted to use defaults.
"""

import json
import os
import time
from datetime import datetime, timezone

# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_JSON = os.path.join(SCRIPT_DIR, "project_tasks.json")
OUTPUT_SQL = os.path.join(SCRIPT_DIR, "seed_project_tasks.sql")

# D1 database name (matches wrangler.jsonc binding for DB)
D1_DATABASE_NAME = "core-github-api"

# Canonical repo ID for core-github-api in the repositories table
REPO_ID = "github:jmbish04/core-github-api"

# ── Helpers ──────────────────────────────────────────────────────────────────

def now_unix() -> int:
    """Return current time as unix epoch integer (seconds)."""
    return int(time.time())


def escape(value) -> str:
    """Escape a value for safe inclusion in a SQL string literal."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert_or_ignore(table: str, columns: list[str], values: list) -> str:
    """Generate a single INSERT OR IGNORE statement."""
    col_list = ", ".join(columns)
    val_list = ", ".join(escape(v) for v in values)
    return f"INSERT OR IGNORE INTO {table} ({col_list}) VALUES ({val_list});"


# ── Generators ───────────────────────────────────────────────────────────────

def gen_epics(rows: list, ts: int) -> list[str]:
    """pm_epics → epics: project_id mapped to repo_id."""
    stmts = []
    for r in rows:
        stmts.append(insert_or_ignore(
            "epics",
            ["id", "repo_id", "title", "description", "status", "priority", "created_at", "updated_at"],
            [
                r["id"],
                REPO_ID,
                r["title"],
                r.get("description"),
                r.get("status", "todo"),
                r.get("priority", "medium"),
                ts,   # INTEGER unix epoch
                ts,
            ]
        ))
    return stmts


def gen_stories(rows: list, ts: int) -> list[str]:
    """pm_stories → stories: epic_id mapped to parent_id, repo_id added."""
    stmts = []
    for r in rows:
        stmts.append(insert_or_ignore(
            "stories",
            ["id", "repo_id", "parent_id", "title", "description", "status", "priority", "created_at", "updated_at"],
            [
                r["id"],
                REPO_ID,
                r["epicId"],   # pm_stories.epicId → stories.parent_id (FK → epics.id)
                r["title"],
                r.get("description"),
                r.get("status", "todo"),
                r.get("priority", "medium"),
                ts,
                ts,
            ]
        ))
    return stmts


def gen_tasks(rows: list) -> list[str]:
    """pm_tasks → tasks: story_id mapped to parent_id, order mapped to position."""
    stmts = []
    for r in rows:
        stmts.append(insert_or_ignore(
            "tasks",
            # tasks.created_at/updated_at default to CURRENT_TIMESTAMP — omit to use defaults
            ["id", "repo_id", "parent_id", "title", "description", "status", "priority", "position", "kanban_column"],
            [
                r["id"],
                REPO_ID,
                r["storyId"],  # pm_tasks.storyId → tasks.parent_id (FK → stories.id)
                r["title"],
                r.get("description"),
                r.get("status", "todo"),
                r.get("priority", "medium"),
                r.get("order", 0),  # pm_tasks.order → tasks.position
                "backlog",          # default kanban column for all seeded tasks
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

    # Source keys (pm_* JSON structure)
    epics   = data.get("pm_epics", [])
    stories = data.get("pm_stories", [])
    tasks   = data.get("pm_tasks", [])

    lines: list[str] = []

    lines += [
        "-- ============================================================",
        "-- seed_project_tasks.sql",
        f"-- Generated: {seeded_at}",
        f"-- Source:    project_tasks.json (pm_* → backlog tables)",
        f"-- Repo:      {REPO_ID}",
        f"-- Tables:    epics, stories, tasks",
        "-- Strategy:  INSERT OR IGNORE (idempotent — safe to re-run)",
        "-- ============================================================",
        "",
        "PRAGMA foreign_keys = OFF;",
        "",
    ]

    # ── epics ─────────────────────────────────────────────────────────────
    lines += [
        "-- ──────────────────────────────────────────────",
        f"-- epics  ({len(epics)} rows)  [mapped from pm_epics]",
        "-- ──────────────────────────────────────────────",
    ]
    lines += gen_epics(epics, ts)
    lines += [""]

    # ── stories ───────────────────────────────────────────────────────────
    lines += [
        "-- ──────────────────────────────────────────────",
        f"-- stories  ({len(stories)} rows)  [mapped from pm_stories]",
        "-- ──────────────────────────────────────────────",
    ]
    lines += gen_stories(stories, ts)
    lines += [""]

    # ── tasks ─────────────────────────────────────────────────────────────
    lines += [
        "-- ──────────────────────────────────────────────",
        f"-- tasks  ({len(tasks)} rows)  [mapped from pm_tasks]",
        "-- ──────────────────────────────────────────────",
    ]
    lines += gen_tasks(tasks)
    lines += [""]

    lines += [
        "PRAGMA foreign_keys = ON;",
        "",
        f"-- ✅ Seed complete: {len(epics)} epics, {len(stories)} stories, {len(tasks)} tasks",
        f"-- repo_id: {REPO_ID}",
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
    print(f"── Summary ───────────────────────────────────────────────────────────")
    print(f"  epics   : {len(epics)}")
    print(f"  stories : {len(stories)}")
    print(f"  tasks   : {len(tasks)}")
    print(f"  Total   : {len(epics) + len(stories) + len(tasks)} rows")


if __name__ == "__main__":
    main()
