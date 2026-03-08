import json

with open('frontend/components.json', 'r') as f:
    data = json.load(f)

data['registries']['@audio'] = "https://audio-ui.xyz/r/{name}.json"

with open('frontend/components.json', 'w') as f:
    json.dump(data, f, indent=2)
