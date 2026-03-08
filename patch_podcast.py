with open('frontend/src/components/podcast/PodcastStudio.tsx', 'r') as f:
    content = f.read()

content = content.replace("import { Thread, Composer } from '@assistant-ui/react';", "import { AssistantModal } from '@/components/cloudflare-chat/AssistantModal';")

content = content.replace("<Thread />", "<AssistantModal />")
content = content.replace("<Composer placeholder=\"Command the agent to generate a podcast (e.g. attach a GitHub repo)...\" />", "")

with open('frontend/src/components/podcast/PodcastStudio.tsx', 'w') as f:
    f.write(content)
