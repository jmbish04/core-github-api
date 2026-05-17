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
    
    def _strip_named_list(match):
        names = match.group("names")
        if "SandboxDeps" not in names:
            return match.group(0)

        filtered = []
        for raw_name in names.split(","):
            name = raw_name.strip()
            if not name:
                continue
            base_name = re.sub(r"\s+as\s+.*$", "", name).strip()
            if base_name != "SandboxDeps":
                filtered.append(name)

        if not filtered:
            prefix = match.group("prefix")
            if prefix.lstrip().startswith("import") and "," in prefix:
                return f"{re.sub(r',\\s*$', '', prefix)}{match.group('suffix')}"
            return ""

        return f"{match.group('prefix')}{{ {', '.join(filtered)} }}{match.group('suffix')}"

    import_named = re.compile(
        r"(?P<prefix>\bimport(?:\s+type)?\s*(?:[^{};\n]*?,\s*)?)"
        r"\{(?P<names>[^}]*)\}"
        r"(?P<suffix>\s*from\s*[\"'][^\"']+[\"']\s*;?)",
        re.MULTILINE | re.DOTALL,
    )
    export_named_type = re.compile(
        r"(?P<prefix>\bexport\s+type\s*)"
        r"\{(?P<names>[^}]*)\}"
        r"(?P<suffix>\s*;?)",
        re.MULTILINE | re.DOTALL,
    )
    content = import_named.sub(_strip_named_list, content)
    content = export_named_type.sub(_strip_named_list, content)
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
