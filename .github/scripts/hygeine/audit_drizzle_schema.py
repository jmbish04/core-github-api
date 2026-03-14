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
    
    file_contents = {}

    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                file_contents[file_path] = content
                matches = table_regex.findall(content)
                for var_name, table_name in matches:
                    rel_path = os.path.relpath(file_path, root_dir)
                    tables.append({
                        "var_name": var_name,
                        "table_name": table_name,
                        "file": rel_path,
                        "var_regex": re.compile(r"\b" + re.escape(var_name) + r"\b"),
                        "export_regex": re.compile(r"export\s+const\s+" + re.escape(var_name) + r"\b")
                    })
        except Exception as e:
            print(f"Warning: Could not read {file_path}: {e}")

    file_interactions = defaultdict(set)
    db1_map = defaultdict(set) # For env.DB
    db2_map = defaultdict(set) # For env.DB_WEBHOOKS
    
    # 2. Scan files for table imports and D1 database interactions
    # Catch AI Slop (Orphaned Tables)
    all_discovered = sorted(list(set(t['table_name'] for t in tables)))
    all_imported_tables = set()

    for file_path, content in file_contents.items():
        rel_path = os.path.relpath(file_path, root_dir)

        # Look for standard Cloudflare Worker / Hono context bindings
        uses_db1 = 'env.DB' in content or 'c.env.DB' in content
        uses_db2 = 'env.DB_WEBHOOKS' in content or 'c.env.DB_WEBHOOKS' in content

        imported_tables = set()

        for t in tables:
            # Check for usage/import
            if t['var_regex'].search(content):
                imported_tables.add(t['table_name'])
                
                if uses_db1:
                    db1_map[t['table_name']].add(rel_path)
                if uses_db2:
                    db2_map[t['table_name']].add(rel_path)
                    
                # Also check if the table is used/imported vs being exported here
                if not t['export_regex'].search(content):
                    all_imported_tables.add(t['table_name'])

        if imported_tables:
            file_interactions[rel_path] = imported_tables

    # 3. Generate the Markdown Report
    md = ["# Drizzle ORM Schema & D1 Analysis Report\n"]
    md.append("## Table Names by Database\n")

    def generate_table_list(db_name, db_sorted_keys):
        prefix = "\n### " if db_name != "env.DB" else "### "
        md.append(f"{prefix}{db_name}")
        if db_sorted_keys:
            for t in db_sorted_keys:
                md.append(f"- {t}")
        else:
            md.append(f"- *No tables definitively mapped to {db_name} yet*")

    db1_sorted = sorted(db1_map.keys())
    db2_sorted = sorted(db2_map.keys())

    generate_table_list("env.DB", db1_sorted)
    generate_table_list("env.DB_WEBHOOKS", db2_sorted)

    # Track any imported tables
    for file_path, imported_tables_set in file_interactions.items():
        all_imported_tables = all_imported_tables.union(imported_tables_set)

    mapped_tables = set(db1_sorted + db2_sorted).union(all_imported_tables)
    unmapped = [t for t in all_discovered if t not in mapped_tables]
    
    if unmapped:
        md.append("\n### Unmapped / Orphaned Schema Tables")
        md.append("*(Suspicious AI Slop: Defined in code but no CRUD operations with a known D1 env var detected)*")
        for t in unmapped:
            md.append(f"- {t}")

    md.append("\n---\n\n## Code Files Interacting with D1 Tables\n")
    for file_path in sorted(file_interactions.keys()):
        tables_used = ", ".join(sorted(file_interactions[file_path]))
        md.append(f"### `{file_path}`")
        md.append(f"- **Tables Imported:** {tables_used}\n")

    def generate_d1_db_table(db_name, db_sorted_keys, db_map):
        prefix = "\n## " if db_name != "env.DB" else "---\n\n## "
        md.append(f"{prefix}{db_name} d1 db")
        md.append("| Table Name | Short File Paths |")
        md.append("|---|---|")
        if db_sorted_keys:
            for t in db_sorted_keys:
                paths = ", ".join([f"`{p}`" for p in sorted(db_map[t])])
                md.append(f"| **{t}** | {paths} |")
        else:
            md.append("| *None Detected* | *N/A* |")

    generate_d1_db_table("env.DB", db1_sorted, db1_map)
    generate_d1_db_table("env.DB_WEBHOOKS", db2_sorted, db2_map)

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
