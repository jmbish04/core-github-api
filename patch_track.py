import glob
import os

for filepath in glob.glob('frontend/src/components/audio/*.tsx'):
    with open(filepath, 'r') as f:
        content = f.read()

    content = content.replace('import { useAudio } from "@/components/hooks/use-audio";', 'import { useAudio } from "@/hooks/use-audio";')
    content = content.replace('from "@/components/lib/audio-store"', 'from "@/lib/audio-store"')
    content = content.replace('from "@/components/lib/utils"', 'from "@/lib/utils"')
    content = content.replace('from "@/components/lib/web-audio"', 'from "@/lib/web-audio"')
    content = content.replace('from "@/components/lib/html-audio"', 'from "@/lib/html-audio"')

    with open(filepath, 'w') as f:
        f.write(content)
