#!/usr/bin/env python3
"""
scripts/db/reset_d1.py

Autonomous D1 Fresh Instance Creator.

Steps:
  1. Read current D1 UUIDs dynamically from wrangler.jsonc (no hardcoded UUIDs)
  2. Export all row data from each instance → scripts/db/data_exports/{date}/
  3. Delete old D1 instances via CF REST API
  4. Create fresh instances with canonical names
  5. Patch wrangler.jsonc with new UUIDs
  6. Archive old migration history

Then the pnpm chain runs: db:generate:all → migrate:remote:all → deploy

After that, run seed_prep.py + seed_run.py to re-populate data.

Usage:
    pnpm run db:reset
"""

import subprocess
import sys
import json
import re
import shutil
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

# ---------------------
# Configuration
# ---------------------
CF_TOKEN_NAME = "CLOUDFLARE_WRANGLER_API_TOKEN"
CF_ACCOUNT_ID_TOKEN_NAME = "CLOUDFLARE_ACCOUNT_ID"

# New DB names (same as current — Cloudflare allows duplicate names;
# the binding is by UUID not name)
DB_CORE_NAME = "core-github-api"
DB_WEBHOOKS_NAME = "core-github-api-webhooks"

WRANGLER_CONFIG = Path("wrangler.jsonc")
MIGRATIONS_CORE = Path("migrations/core")
MIGRATIONS_WEBHOOKS = Path("migrations/webhooks")
EXPORTS_DIR = Path("scripts/db/data_exports")

# D1 API limits — used by seed scripts, defined here as single source of truth
D1_MAX_ROWS_PER_BATCH = 100          # conservative safe batch for INSERT statements
D1_MAX_PARAMS_PER_QUERY = 100        # Cloudflare hard limit
D1_MAX_STATEMENT_BYTES = 90_000      # 90 KB of the 100 KB limit (leaving headroom)

# ---------------------
# Token Fetching
# ---------------------

def get_token_from_cli(token_name: str) -> str:
    """Fetches a secret using the local `tokens` CLI service."""
    try:
        print(f"🔑 Fetching {token_name} via CLI...")
        result = subprocess.run(
            ["tokens", "show", token_name, "--value-only"],
            capture_output=True, text=True, check=True
        )
        token = result.stdout.strip()
        if not token:
            raise ValueError("Token returned empty.")
        return token
    except subprocess.CalledProcessError as e:
        print(f"❌ Error fetching token '{token_name}': {e.stderr.strip() or e.stdout.strip()}")
        sys.exit(1)
    except FileNotFoundError:
        print("❌ Error: The 'tokens' CLI command was not found on your system path.")
        sys.exit(1)

# ---------------------
# UUID Extraction (Dynamic)
# ---------------------

def extract_uuids_from_wrangler() -> tuple[str, str]:
    """
    Reads wrangler.jsonc to extract the current UUIDs for DB and DB_WEBHOOKS.
    This replaces hardcoded OLD_CORE_UUID / OLD_WEBHOOKS_UUID — fully autonomous.

    Returns: (core_uuid, webhooks_uuid)
    """
    print(f"\n[1/6] Reading current UUIDs from {WRANGLER_CONFIG}...")

    raw = WRANGLER_CONFIG.read_text(encoding="utf-8")

    # Match: "binding": "DB" ... "database_id": "<uuid>"
    # Uses DOTALL so the pattern spans the block
    core_match = re.search(
        r'"binding"\s*:\s*"DB"[^}]*?"database_id"\s*:\s*"([a-f0-9\-]+)"',
        raw, flags=re.DOTALL
    )
    webhooks_match = re.search(
        r'"binding"\s*:\s*"DB_WEBHOOKS"[^}]*?"database_id"\s*:\s*"([a-f0-9\-]+)"',
        raw, flags=re.DOTALL
    )

    if not core_match:
        print("❌ Could not find DB binding/database_id in wrangler.jsonc")
        sys.exit(1)
    if not webhooks_match:
        print("❌ Could not find DB_WEBHOOKS binding/database_id in wrangler.jsonc")
        sys.exit(1)

    core_uuid = core_match.group(1)
    webhooks_uuid = webhooks_match.group(1)
    print(f"  ✅ DB (core)    UUID: {core_uuid}")
    print(f"  ✅ DB_WEBHOOKS  UUID: {webhooks_uuid}")
    return core_uuid, webhooks_uuid

# ---------------------
# Pre-Delete Data Export
# ---------------------

def export_database(db_binding: str, db_uuid: str, db_label: str, export_dir: Path) -> None:
    """
    Exports all rows from a D1 instance into SQL and JSON files before deletion.

    Files written:
      export_dir/{label}.sql   — INSERT statements (best-effort; empty tables skipped)
      export_dir/{label}.json  — full JSON rows per table
    """
    print(f"\n  📦 Exporting '{db_label}' ({db_uuid[:8]}...)...")

    sql_lines: list[str] = [
        f"-- D1 Export: {db_label}",
        f"-- Binding: {db_binding}",
        f"-- UUID: {db_uuid}",
        f"-- Exported: {datetime.utcnow().isoformat()}Z",
        "",
        "PRAGMA foreign_keys = OFF;",
        "",
    ]
    all_data: dict[str, list[dict]] = {}

    # 1. Get table list
    try:
        result = subprocess.run(
            [
                "wrangler", "d1", "execute", db_binding, "--remote",
                "--command", "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;",
                "--json"
            ],
            capture_output=True, text=True
        )
        output = json.loads(result.stdout)
        tables = [row["name"] for row in output[0].get("results", [])]
    except Exception as e:
        print(f"  ⚠️  Could not list tables for {db_label}: {e}")
        return

    print(f"  📋 Found {len(tables)} tables to export")

    for table in tables:
        try:
            row_res = subprocess.run(
                [
                    "wrangler", "d1", "execute", db_binding, "--remote",
                    "--command", f'SELECT * FROM "{table}";',
                    "--json"
                ],
                capture_output=True, text=True
            )
            rows_output = json.loads(row_res.stdout)
            rows = rows_output[0].get("results", []) if rows_output else []

            all_data[table] = rows

            if rows:
                columns = list(rows[0].keys())
                col_str = ", ".join(f'"{c}"' for c in columns)
                sql_lines.append(f"-- Table: {table} ({len(rows)} rows)")

                for row in rows:
                    vals = ", ".join(
                        "NULL" if v is None
                        else f"'{str(v).replace(chr(39), chr(39)*2)}'"
                        for v in row.values()
                    )
                    sql_lines.append(f'INSERT OR IGNORE INTO "{table}" ({col_str}) VALUES ({vals});')
                sql_lines.append("")
        except Exception as e:
            print(f"  ⚠️  Could not export table {table}: {e}")
            all_data[table] = []

    sql_lines.append("PRAGMA foreign_keys = ON;")

    # Write SQL
    sql_path = export_dir / f"{db_label}.sql"
    sql_path.write_text("\n".join(sql_lines), encoding="utf-8")
    print(f"  ✅ SQL export → {sql_path} ({len(sql_lines)} lines)")

    # Write JSON
    json_path = export_dir / f"{db_label}.json"
    json_path.write_text(json.dumps(all_data, indent=2), encoding="utf-8")
    print(f"  ✅ JSON export → {json_path}")


def export_all_databases(core_uuid: str, webhooks_uuid: str) -> Path:
    """Exports both D1 instances and returns the export directory path."""
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    export_dir = EXPORTS_DIR / timestamp
    export_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n[2/6] Exporting data before deletion → {export_dir}")

    export_database("DB", core_uuid, "core-github-api", export_dir)
    export_database("DB_WEBHOOKS", webhooks_uuid, "core-github-api-webhooks", export_dir)

    print(f"  ✅ All exports saved to: {export_dir}")
    return export_dir

# ---------------------
# Wrangler D1 Delete / Create
# ---------------------

def delete_d1_database(db_name: str, db_uuid: str, cf_token: str, account_id: str) -> None:
    """
    Deletes a D1 database by UUID using the Cloudflare REST API directly
    (wrangler d1 delete requires interactive confirmation).
    """
    print(f"  🗑️  Deleting '{db_name}' ({db_uuid[:8]}...)...")
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{db_uuid}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {cf_token}",
            "Content-Type": "application/json",
        },
        method="DELETE"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = json.loads(e.read().decode("utf-8"))
        errors = body.get("errors", [])
        if any(err.get("code") in (7404, 404) for err in errors):
            print(f"  ℹ️  '{db_name}' not found — already deleted, skipping.")
            return
        print(f"  ❌ Failed to delete '{db_name}': {errors}")
        sys.exit(1)

    if body.get("success"):
        print(f"  ✅ Deleted '{db_name}'")
    else:
        print(f"  ❌ Unexpected failure deleting '{db_name}': {body}")
        sys.exit(1)


def create_d1_database(account_id: str, cf_token: str, db_name: str) -> dict:
    """Creates a new D1 database. Returns { uuid, name, version, created_at }."""
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database"
    payload = json.dumps({"name": db_name}).encode("utf-8")
    req = urllib.request.Request(
        url, data=payload,
        headers={
            "Authorization": f"Bearer {cf_token}",
            "Content-Type": "application/json",
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = json.loads(e.read().decode("utf-8"))
        errors = body.get("errors", [])
        print(f"❌ Cloudflare API error creating '{db_name}':")
        for err in errors:
            print(f"   [{err.get('code')}] {err.get('message')}")
        sys.exit(1)

    if not body.get("success"):
        print(f"❌ Unexpected failure creating '{db_name}': {body}")
        sys.exit(1)

    result = body["result"]
    print(f"  ✅ Created '{db_name}' → UUID: {result['uuid']}")
    return result

# ---------------------
# wrangler.jsonc Patcher
# ---------------------

def patch_wrangler(core_uuid: str, webhooks_uuid: str) -> None:
    """Updates database_id fields in wrangler.jsonc for both DB bindings."""
    print(f"\n[5/6] Patching {WRANGLER_CONFIG}...")

    raw = WRANGLER_CONFIG.read_text(encoding="utf-8")

    # Back up the original
    backup_path = WRANGLER_CONFIG.parent / f"wrangler.jsonc.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.copy(WRANGLER_CONFIG, backup_path)
    print(f"  📄 Backup saved → {backup_path}")

    # Patch DB (binding = "DB")
    raw, n_core = re.subn(
        r'("binding"\s*:\s*"DB"[^}]*?"database_id"\s*:\s*")[^"]+(")',
        rf'\g<1>{core_uuid}\g<2>',
        raw, count=1, flags=re.DOTALL,
    )
    if n_core == 0:
        print("❌ Could not find 'DB' database_id in wrangler.jsonc.")
        sys.exit(1)
    print(f"  ✅ DB (core) database_id → {core_uuid}")

    # Patch DB_WEBHOOKS
    raw, n_webhooks = re.subn(
        r'("binding"\s*:\s*"DB_WEBHOOKS"[^}]*?"database_id"\s*:\s*")[^"]+(")',
        rf'\g<1>{webhooks_uuid}\g<2>',
        raw, count=1, flags=re.DOTALL,
    )
    if n_webhooks == 0:
        print("❌ Could not find 'DB_WEBHOOKS' database_id in wrangler.jsonc.")
        sys.exit(1)
    print(f"  ✅ DB_WEBHOOKS database_id → {webhooks_uuid}")

    WRANGLER_CONFIG.write_text(raw, encoding="utf-8")
    print(f"  ✅ {WRANGLER_CONFIG} updated.")

# ---------------------
# Migration Reset
# ---------------------

def reset_migrations() -> None:
    """Archives and clears Drizzle migration dirs so db:generate starts from 0000."""
    print("\n[6/6] Resetting Drizzle migration history...")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_root = Path("migrations/_archive") / timestamp
    archive_root.mkdir(parents=True, exist_ok=True)

    for migrations_dir, label in [
        (MIGRATIONS_CORE, "core"),
        (MIGRATIONS_WEBHOOKS, "webhooks"),
    ]:
        if not migrations_dir.exists():
            print(f"  ℹ️  {migrations_dir} does not exist, skipping.")
            continue

        archive_dest = archive_root / label
        shutil.copytree(migrations_dir, archive_dest)
        shutil.rmtree(migrations_dir)
        migrations_dir.mkdir(parents=True, exist_ok=True)
        print(f"  ✅ Archived {migrations_dir} → {archive_dest}")

    print(f"  📦 Old migrations preserved at: migrations/_archive/{timestamp}/")

# ---------------------
# Main
# ---------------------

def main():
    print("=" * 60)
    print("  🗄️  D1 Autonomous Fresh Instance Creator")
    print("  core-github-api project")
    print("=" * 60)

    # 0. Confirm working directory
    if not WRANGLER_CONFIG.exists():
        print(f"❌ Cannot find {WRANGLER_CONFIG}. Run from repo root.")
        sys.exit(1)

    # 1. Read UUIDs dynamically from wrangler.jsonc (no hardcoded constants!)
    old_core_uuid, old_webhooks_uuid = extract_uuids_from_wrangler()

    # 2. Fetch credentials (needed for CF API delete + create)
    print("\n[2/6] Fetching credentials...")
    cf_token = get_token_from_cli(CF_TOKEN_NAME)
    account_id = get_token_from_cli(CF_ACCOUNT_ID_TOKEN_NAME)
    print(f"  ✅ Account ID: {account_id[:8]}...")

    # Step numbering shift: export is now step 2 in the flow, delete is 3, etc.
    # 3. Export data before deletion (safety first!)
    export_dir = export_all_databases(old_core_uuid, old_webhooks_uuid)

    # 4. Delete old instances
    print(f"\n[4/6] Deleting old D1 instances...")
    delete_d1_database(DB_CORE_NAME, old_core_uuid, cf_token, account_id)
    delete_d1_database(DB_WEBHOOKS_NAME, old_webhooks_uuid, cf_token, account_id)

    # 5. Create fresh instances
    print(f"\n[5/6] Creating fresh D1 instances...")
    core_db = create_d1_database(account_id, cf_token, DB_CORE_NAME)
    webhooks_db = create_d1_database(account_id, cf_token, DB_WEBHOOKS_NAME)

    # 6. Patch wrangler.jsonc with new UUIDs
    patch_wrangler(core_db["uuid"], webhooks_db["uuid"])

    # 7. Reset migration history
    reset_migrations()

    print("\n" + "=" * 60)
    print("  ✅ Done! pnpm will now run: db:generate:all → migrate:remote:all → deploy")
    print("=" * 60)
    print(f"""
  New UUIDs written to wrangler.jsonc:
    DB (core)    → {core_db['uuid']}
    DB_WEBHOOKS  → {webhooks_db['uuid']}

  📦 Data exported to: {export_dir}

  ─────────────────────────────────────────
  NEXT STEP (after deploy completes):
  ─────────────────────────────────────────
  Restore prior data by running:

    python3 scripts/db/seed_prep.py --export-dir {export_dir}
    python3 scripts/db/seed_run.py --export-dir {export_dir}

  ⚠️  Run seed_prep.py first — it normalizes the exported data to
     respect D1 row/param limits before seed_run.py applies them.
""")

if __name__ == "__main__":
    main()
