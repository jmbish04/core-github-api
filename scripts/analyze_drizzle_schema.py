#!/usr/bin/env python3
"""
Drizzle Schema Analysis Report Generator

Scans all TypeScript schema files under src/backend/src/db/schemas/
for sqliteTable definitions and produces a Markdown report listing
every table, its domain, and flags any that appear orphaned (defined
but never imported in the main schema barrel).
"""

import argparse
import re
import sys
from pathlib import Path

SCHEMA_DIR = Path("src/backend/src/db/schemas")
BARREL_FILE = Path("src/backend/src/db/schema.ts")

TABLE_PATTERN = re.compile(
    r"""(?:export\s+const\s+)(\w+)\s*=\s*sqliteTable\(\s*['"]([^'"]+)['"]""",
    re.MULTILINE,
)


def discover_tables(schema_dir: Path) -> list[dict]:
    """Walk schema dir and extract all sqliteTable definitions."""
    tables = []
    if not schema_dir.exists():
        return tables

    for ts_file in sorted(schema_dir.rglob("*.ts")):
        content = ts_file.read_text(errors="replace")
        for match in TABLE_PATTERN.finditer(content):
            var_name = match.group(1)
            sql_name = match.group(2)
            # Derive domain from relative path
            rel = ts_file.relative_to(schema_dir)
            domain = rel.parts[0] if len(rel.parts) > 1 else "root"
            tables.append(
                {
                    "variable": var_name,
                    "sql_name": sql_name,
                    "domain": domain,
                    "file": str(ts_file),
                }
            )
    return tables


def find_barrel_exports(barrel: Path) -> set[str]:
    """Return set of identifiers exported from the schema barrel."""
    if not barrel.exists():
        return set()
    content = barrel.read_text(errors="replace")
    # Match named exports: export { foo, bar } from '...'
    exported = set()
    for m in re.finditer(r"export\s*\{([^}]+)\}", content):
        names = m.group(1)
        for name in names.split(","):
            clean = name.strip().split(" as ")[0].strip()
            if clean:
                exported.add(clean)
    # Match re-exports: export * from '...'
    for m in re.finditer(r"""export\s*\*\s*from\s*['"]([^'"]+)['"]""", content):
        # Try to resolve the file and extract its exports
        pass
    return exported


def generate_report(tables: list[dict], barrel_exports: set[str]) -> str:
    """Generate Markdown report."""
    lines = ["# Drizzle Schema Analysis Report", ""]
    lines.append(f"**Total tables discovered:** {len(tables)}")
    lines.append("")

    # Group by domain
    domains: dict[str, list[dict]] = {}
    for t in tables:
        domains.setdefault(t["domain"], []).append(t)

    lines.append("## Tables by Domain")
    lines.append("")
    for domain in sorted(domains):
        domain_tables = domains[domain]
        lines.append(f"### {domain.title()} ({len(domain_tables)} tables)")
        lines.append("")
        lines.append("| Variable | SQL Table | File |")
        lines.append("|----------|-----------|------|")
        for t in sorted(domain_tables, key=lambda x: x["sql_name"]):
            short_file = t["file"].replace("src/backend/src/db/schemas/", "")
            lines.append(f"| `{t['variable']}` | `{t['sql_name']}` | `{short_file}` |")
        lines.append("")

    # Check for orphaned tables (defined but not in barrel)
    if barrel_exports:
        orphaned = [t for t in tables if t["variable"] not in barrel_exports]
        if orphaned:
            lines.append("### Unmapped / Orphaned Schema Tables")
            lines.append("")
            lines.append(
                "These tables are defined but may not be exported from the schema barrel:"
            )
            lines.append("")
            for t in orphaned:
                lines.append(f"- `{t['variable']}` (`{t['sql_name']}`) in `{t['file']}`")
            lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Analyze Drizzle ORM schema definitions")
    parser.add_argument("--output", "-o", default="drizzle-schema-report.md", help="Output file path")
    args = parser.parse_args()

    tables = discover_tables(SCHEMA_DIR)
    barrel_exports = find_barrel_exports(BARREL_FILE)
    report = generate_report(tables, barrel_exports)

    Path(args.output).write_text(report)
    print(f"Schema report written to {args.output} ({len(tables)} tables found)")


if __name__ == "__main__":
    main()
