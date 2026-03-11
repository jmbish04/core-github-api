with open('backend/src/ai/agents/Podcast.ts', 'r') as f:
    content = f.read()

content = content.replace('// import { OpenAI } from "openai";', 'import { OpenAI } from "openai";')

with open('backend/src/ai/agents/Podcast.ts', 'w') as f:
    f.write(content)
