#!/usr/bin/env python3
import os
import re
import sys
import argparse
from collections import defaultdict

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
    parser = argparse.ArgumentParser(description="Analyze Drizzle ORM schema and D1 usage.")
    parser.add_argument("--output", default="drizzle-schema-report.md", help="Output Markdown file path")
    args = parser.parse_args()

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
    all_discovered = sorted(list(set(t['table_name'] for t in tables)))
    mapped_tables = set(db1_sorted + db2_sorted)
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
