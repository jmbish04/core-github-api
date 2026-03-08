import re

with open('backend/src/utils/email/send/repo-discovery.ts', 'r') as f:
    content = f.read()

target = 'export interface DailyTrendsData {'
replacement = target + '\n  podcastId?: string;'

content = content.replace(target, replacement)

with open('backend/src/utils/email/send/repo-discovery.ts', 'w') as f:
    f.write(content)
