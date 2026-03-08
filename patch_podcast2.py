with open('frontend/src/components/podcast/PodcastStudio.tsx', 'r') as f:
    content = f.read()

content = content.replace("import { AssistantModal } from '@/components/cloudflare-chat/AssistantModal';", "import { AssistantModal } from '@assistant-ui/react';")
content = content.replace("<AssistantModal />", "")

with open('frontend/src/components/podcast/PodcastStudio.tsx', 'w') as f:
    f.write(content)
