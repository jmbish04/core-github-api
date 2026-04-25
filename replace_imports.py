import os
import re

targets = [
    "src/backend/src/ai/agents/EngineerAgent/methods/sandbox",
    "src/backend/src/ai/agents/EngineerAgent/methods/sandbox.ts"
]

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    orig_content = content
    
    # regex to remove lines that import *only* SandboxDeps
    content = re.sub(r'import\s+type\s*\{\s*SandboxDeps\s*\}\s*from\s*["\'].*?["\'];?\n', '', content)
    # regex to remove SandboxDeps from list of imports if other things are there
    content = re.sub(r'SandboxDeps,\s*', '', content)
    content = re.sub(r',\s*SandboxDeps\s*', '', content)
    content = re.sub(r'import\s+type\s*\{\s*\}\s*from\s*["\'].*?["\'];?\n', '', content)

    if content != orig_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Cleaned imports in {filepath}")

for target in targets:
    if os.path.isfile(target):
        process_file(target)
    elif os.path.isdir(target):
        for root, dirs, files in os.walk(target):
            if files:
                for file in files:
                    if file.endswith('.ts'):
                        process_file(os.path.join(root, file))

