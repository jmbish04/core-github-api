with open('frontend/src/components/audio/player.tsx', 'r') as f:
    content = f.read()

content = content.replace('import { useAudio } from "@/components/hooks/use-audio";', 'import { useAudio } from "@/hooks/use-audio";')

with open('frontend/src/components/audio/player.tsx', 'w') as f:
    f.write(content)
