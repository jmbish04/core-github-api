with open('backend/src/ai/agents/Podcast.ts', 'r') as f:
    content = f.read()

content = content.replace('import { OpenAI } from "openai";', '// import { OpenAI } from "openai";')
content = content.replace('import { podcasts } from "../../db/schemas/app/podcasts";', 'import { podcasts } from "@/db/schemas/app/podcasts";')
content = content.replace('return this.app.fetch(req, this.env, this.ctx);', 'return this.app.fetch(req, this.env, this.ctx as any);')

with open('backend/src/ai/agents/Podcast.ts', 'w') as f:
    f.write(content)
