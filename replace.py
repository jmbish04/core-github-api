import os
import re

targets = [
    "src/backend/src/ai/agents/EngineerAgent/methods/sandbox",
    "src/backend/src/ai/agents/EngineerAgent/methods/sandbox.ts"
]

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    if "SandboxDeps" not in content and "deps.env" not in content:
        return
        
    orig_content = content
    
    # 1. Replace type definition if exists
    content = re.sub(r'type SandboxDeps =\s*\{\s*env:\s*Env;\s*\};\s*', '', content)
    
    # 2. Replace parameter type
    content = re.sub(r'(?<!_)deps:\s*SandboxDeps', 'env: Env', content)
    # createSession might have been hand edited, ensure no duplicate 
    content = re.sub(r'env:\s*Env,\s*env:\s*Env', 'env: Env', content)
    
    # 3. Replace usages of deps.env
    content = content.replace("deps.env", "env")
    
    # 4. Remove SandboxDeps from imports
    content = re.sub(r'SandboxDeps,\s*', '', content)
    content = re.sub(r',\s*SandboxDeps', '', content)
    content = re.sub(r'import\s+type\s*\{\s*\}\s*from\s*["\']\.[^"\']*["\'];?\n', '', content)
    content = re.sub(r'import\s*\{\s*\}\s*from\s*["\']\.[^"\']*["\'];?\n', '', content)
    content = re.sub(r'import\s*type\s*SandboxDeps\s*from\s*["\']\.[^"\']*["\'];?\n', '', content)
    
    if content != orig_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")

for target in targets:
    if os.path.isfile(target):
        process_file(target)
    elif os.path.isdir(target):
        for root, dirs, files in os.walk(target):
            for file in files:
                if file.endswith('.ts'):
                    process_file(os.path.join(root, file))

