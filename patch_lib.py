import glob

for filepath in glob.glob('frontend/src/lib/*.ts') + glob.glob('frontend/src/hooks/*.ts'):
    with open(filepath, 'r') as f:
        content = f.read()

    content = content.replace('from "@/components/lib/html-audio"', 'from "@/lib/html-audio"')
    content = content.replace('from "@/components/lib/web-audio"', 'from "@/lib/web-audio"')
    content = content.replace('from "@/components/lib/audio-store"', 'from "@/lib/audio-store"')
    content = content.replace('from "@/components/lib/utils"', 'from "@/lib/utils"')
    content = content.replace('from "@/components/hooks/use-audio"', 'from "@/hooks/use-audio"')

    with open(filepath, 'w') as f:
        f.write(content)
