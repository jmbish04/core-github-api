import re

with open('scripts/db/audit_drizzle_schema.py', 'r') as f:
    content = f.read()

search = """            uses_do_sqlite = 'this.ctx.storage.sql' in content or 'this.sql' in content or 'getAgentDb' in content or 'storage.sql.exec' in content"""
replace = """            uses_do_sqlite = 'this.ctx.storage.sql' in content or 'this.sql' in content or 'getAgentDb' in content or 'storage.sql.exec' in content or 'db.insert' in content or 'db.select' in content or 'db.update' in content or 'db.delete' in content or 'getDb(' in content"""

content = content.replace(search, replace)

with open('scripts/db/audit_drizzle_schema.py', 'w') as f:
    f.write(content)
