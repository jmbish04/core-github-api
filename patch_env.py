import re

with open('worker-configuration.d.ts', 'r') as f:
    content = f.read()

target = "ORCHESTRATOR: DurableObjectNamespace<import(\"./backend/src/index\").OrchestratorAgent>;"
replacement = target + "\n\t\tPODCAST_AGENT: DurableObjectNamespace<import(\"./backend/src/ai/agents/Podcast\").PodcastAgent>;\n\t\tPODCAST_BUCKET: R2Bucket;"

content = content.replace(target, replacement)

with open('worker-configuration.d.ts', 'w') as f:
    f.write(content)
