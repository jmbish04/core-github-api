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
    
    # Remove any import of SandboxDeps
    content = re.sub(r'import\s+.*?SandboxDeps.*?\n', '', content)
    # Remove any export of SandboxDeps
    content = re.sub(r'export\s+type\s*\{\s*SandboxDeps\s*\}.*?\n', '', content)
    # If the file is only an export of SandboxDeps, it might be empty now, but that's fine.

    if content != orig_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Cleaned SandboxDeps from {filepath}")

for target in targets:
    if os.path.isfile(target):
        process_file(target)
    elif os.path.isdir(target):
        for root, dirs, files in os.walk(target):
            for file in files:
                if file.endswith('.ts'):
                    process_file(os.path.join(root, file))

