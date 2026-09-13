#!/usr/bin/env python3
import os
import re
import sys
import argparse
from collections import defaultdict
from datetime import datetime

def get_ts_files(root_dir):
    """Recursively find all TypeScript files, ignoring build/module directories."""
    ignore_dirs = {'node_modules', 'dist', '.git', '.wrangler', '.vscode', 'drizzle', '.github'}
    ts_files = []
    
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Modify dirnames in-place to skip ignored directories
        dirnames[:] = [d for d in dirnames if d not in ignore_dirs]
        for filename in filenames:
            if filename.endswith('.ts') or filename.endswith('.tsx'):
                ts_files.append(os.path.join(dirpath, filename))
                
    return ts_files

def _is_schema_barrel(rel_path):
    """A file that only re-exports schema is not a USE of a table."""
    name = os.path.basename(rel_path)
    return name in {"index.ts", "schema.ts"} and (
        "/schema" in rel_path.replace(os.sep, "/") or "/db/" in rel_path.replace(os.sep, "/")
    )


def _known_orphans(root_dir):
    """Tables already known to be orphaned, from `scripts/db/known-orphan-tables.txt`.

    The allowlist exists so this check can FAIL on new dead schema without
    blocking every unrelated pull request on debt that predates it. Entries are
    meant to leave the list, never to accumulate: the report names any entry
    that is no longer orphaned so it can be deleted.
    """
    path = os.path.join(root_dir, "scripts", "db", "known-orphan-tables.txt")
    if not os.path.exists(path):
        return set()
    with open(path, "r", encoding="utf-8") as handle:
        return {
            line.strip()
            for line in handle
            if line.strip() and not line.lstrip().startswith("#")
        }


def main():
    # Generate timestamp in yyyy-mm-dd 12h time format (e.g., 2026-03-13-06-44pm)
    now_str = datetime.now().strftime("%Y-%m-%d-%I-%M%p").lower()
    filename = f"drizzle-schema-report-{now_str}.md"
    
    # User's custom report location (preserving original spelling of 'hygeine')
    default_report_path = os.path.join(os.getcwd(), "scripts", "reports", "hygeine", filename)
    
    parser = argparse.ArgumentParser(description="Analyze Drizzle ORM schema and D1 usage.")
    parser.add_argument("--output", default=default_report_path, help="Output Markdown file path")
    args = parser.parse_args()

    # Ensure the target directory exists before executing the file scan
    output_dir = os.path.dirname(args.output)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    root_dir = os.getcwd()
    files = get_ts_files(root_dir)
    
    tables = []
    
    # 1. Extract all Drizzle Table definitions
    # Matches: export const varName = sqliteTable('tableName', ...)
    table_regex = re.compile(r"export\s+const\s+([a-zA-Z0-9_]+)\s*=\s*(?:sqliteTable|pgTable|mysqlTable)\(\s*['\"]([^'\"]+)['\"]")
    
    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                matches = table_regex.findall(content)
                for var_name, table_name in matches:
                    rel_path = os.path.relpath(file_path, root_dir)
                    tables.append({
                        "var_name": var_name,
                        "table_name": table_name,
                        "file": rel_path
                    })
        except Exception as e:
            print(f"Warning: Could not read {file_path}: {e}")

    file_interactions = defaultdict(set)
    db1_map = defaultdict(set) # For env.DB
    db2_map = defaultdict(set) # For env.DB_WEBHOOKS
    # Every NON-schema file that references a table variable, whether or not the
    # same file also mentions a binding. This is what decides "orphaned"; the
    # binding maps below stay informational. See the note at `unmapped`.
    referenced = defaultdict(set)
    schema_of = {t['table_name']: t['file'] for t in tables}

    # 2. Scan files for table imports and D1 database interactions
    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            rel_path = os.path.relpath(file_path, root_dir)
            
            # Look for standard Cloudflare Worker / Hono context bindings
            uses_db1 = 'env.DB' in content or 'c.env.DB' in content
            uses_db2 = 'env.DB_WEBHOOKS' in content or 'c.env.DB_WEBHOOKS' in content
            
            imported_tables = set()
            
            for t in tables:
                # Regex boundary check for the specific Drizzle table variable
                var_regex = re.compile(r"\b" + re.escape(t['var_name']) + r"\b")
                
                if var_regex.search(content):
                    imported_tables.add(t['table_name'])

                    # A table's own schema file does not count as a use, and
                    # neither does a barrel that only re-exports it.
                    if rel_path != schema_of.get(t['table_name']) and not _is_schema_barrel(rel_path):
                        referenced[t['table_name']].add(rel_path)

                    if uses_db1:
                        db1_map[t['table_name']].add(rel_path)
                    if uses_db2:
                        db2_map[t['table_name']].add(rel_path)
                        
            if imported_tables:
                file_interactions[rel_path] = imported_tables
                
        except Exception as e:
            print(f"Warning: Could not read {file_path}: {e}")

    # 3. Generate the Markdown Report
    md = ["# Drizzle ORM Schema & D1 Analysis Report\n"]
    md.append("## Table Names by Database\n")
    
    md.append("### env.DB")
    db1_sorted = sorted(db1_map.keys())
    if db1_sorted:
        for t in db1_sorted:
            md.append(f"- {t}")
    else:
        md.append("- *No tables definitively mapped to env.DB yet*")
        
    md.append("\n### env.DB_WEBHOOKS")
    db2_sorted = sorted(db2_map.keys())
    if db2_sorted:
        for t in db2_sorted:
            md.append(f"- {t}")
    else:
        md.append("- *No tables definitively mapped to env.DB_WEBHOOKS yet*")

    # Catch AI Slop (Orphaned Tables)
    #
    # "Orphaned" means NOTHING OUTSIDE ITS OWN SCHEMA FILE references the table.
    # It used to mean "no file that references it also contains the literal
    # `env.DB`", which called eight live tables dead: everything reached through
    # a repository module (`src/backend/src/db/ops/repos.ts`), a service class
    # holding its own handle, or a Durable Object never mentions that string in
    # the same file. A check that cries wolf on a third of its findings is a
    # check the next person disables, so the binding maps below stay as
    # information and reachability decides the failure.
    all_discovered = sorted(list(set(t['table_name'] for t in tables)))
    unmapped = [t for t in all_discovered if not referenced.get(t)]
    known = _known_orphans(root_dir)
    unexpected = [t for t in unmapped if t not in known]
    stale_allowlist = sorted(known - set(unmapped))

    if unmapped:
        md.append("\n### Unmapped / Orphaned Schema Tables")
        md.append("*(Defined in code and referenced from nowhere else - dead schema, or a table whose code was deleted without it.)*")
        for t in unmapped:
            suffix = "  _(known, allowlisted)_" if t in known else ""
            md.append(f"- {t}{suffix}")

    if unexpected:
        md.append("\n### New Orphaned Tables")
        md.append("*(Not in `scripts/db/known-orphan-tables.txt`. These fail the build.)*")
        for t in unexpected:
            md.append(f"- {t}")

    if stale_allowlist:
        md.append("\n### Allowlisted Tables That Are No Longer Orphaned")
        md.append("*(Cleaned up or wired in - remove them from `scripts/db/known-orphan-tables.txt`.)*")
        for t in stale_allowlist:
            md.append(f"- {t}")

    md.append("\n---\n\n## Code Files Interacting with D1 Tables\n")
    for file_path in sorted(file_interactions.keys()):
        tables_used = ", ".join(sorted(file_interactions[file_path]))
        md.append(f"### `{file_path}`")
        md.append(f"- **Tables Imported:** {tables_used}\n")

    md.append("---\n\n## env.DB d1 db")
    md.append("| Table Name | Short File Paths |")
    md.append("|---|---|")
    if db1_sorted:
        for t in db1_sorted:
            paths = ", ".join([f"`{p}`" for p in sorted(db1_map[t])])
            md.append(f"| **{t}** | {paths} |")
    else:
        md.append("| *None Detected* | *N/A* |")

    md.append("\n## env.DB_WEBHOOKS d1 db")
    md.append("| Table Name | Short File Paths |")
    md.append("|---|---|")
    if db2_sorted:
        for t in db2_sorted:
            paths = ", ".join([f"`{p}`" for p in sorted(db2_map[t])])
            md.append(f"| **{t}** | {paths} |")
    else:
        md.append("| *None Detected* | *N/A* |")

    # 4. Write to disk
    try:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write("\n".join(md) + "\n")
        print(f"✅ Schema analysis complete! Report generated at: {args.output}")
    except Exception as e:
        print(f"❌ Failed to write report: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()