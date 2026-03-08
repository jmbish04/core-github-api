with open('frontend/src/layouts/RootLayout.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if line.strip() == "</div>":
        pass # we'll replace it at the end manually
    new_lines.append(line)

content = "".join(new_lines)
content = content.replace("        </div>\n    );\n}", "        </div>\n        </GlobalAudioProvider>\n    );\n}")

with open('frontend/src/layouts/RootLayout.tsx', 'w') as f:
    f.write(content)
