import re

with open('frontend/src/layouts/RootLayout.tsx', 'r') as f:
    content = f.read()

target = 'export default function RootLayout() {'
replacement = """import { GlobalAudioProvider } from "@/components/audio/GlobalAudioProvider";

export default function RootLayout() {"""

content = content.replace(target, replacement)

target2 = '<div className="flex h-screen bg-background text-foreground font-sans antialiased overflow-hidden">'
replacement2 = '<GlobalAudioProvider>\n        <div className="flex h-screen bg-background text-foreground font-sans antialiased overflow-hidden">'
content = content.replace(target2, replacement2)

# Find the closing tag for the main flex div
content = re.sub(r'(</div>\n\s*);\n}', r'\1        </GlobalAudioProvider>\n    );\n}', content)

with open('frontend/src/layouts/RootLayout.tsx', 'w') as f:
    f.write(content)
