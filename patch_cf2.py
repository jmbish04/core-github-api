with open('backend/src/utils/cloudflare/tokens.ts', 'r') as f:
    content = f.read()

content = content.replace("import * as Cloudflare from 'cloudflare';", "import Cloudflare from 'cloudflare';")

with open('backend/src/utils/cloudflare/tokens.ts', 'w') as f:
    f.write(content)
