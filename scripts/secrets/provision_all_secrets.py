#!/usr/bin/env python3
import subprocess
import sys

STORE_ID = "8c42fa70938644e0a8a109744467375f"

SECRETS = [
    # Binding name (in wrangler), Secret Name (in store), Description
    ("GITHUB_CLIENT_SECRET", "CORE_GITHUB_API_GITHUB_SECRET", "GitHub App Client Secret"),
    ("WORKER_API_KEY", "WORKER_API_KEY", "API Key for this Worker (e.g. uuid)"),
    ("CLOUDFLARE_AI_GATEWAY_TOKEN", "CLOUDFLARE_AI_GATEWAY_TOKEN", "Cloudflare AI Gateway Token"),
    ("GITHUB_CLIENT_ID", "CORE_GITHUB_API_GITHUB_CLIENT_ID", "GitHub App Client ID"),
    ("GITHUB_APP_ID", "CORE_GITHUB_API_GITHUB_APP_ID", "GitHub App ID"),
    ("GITHUB_TOKEN", "GITHUB_TOKEN", "GitHub Personal Access Token (PAT)"),
    ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_TOKEN", "Cloudflare API Token"),
]

def upload_secret(name, value):
    print(f"☁️  Processing {name}...")
    
    # Try updating first (if it exists)
    update_cmd = [
        "npx", "wrangler", "secrets-store", "secret", "update", STORE_ID, 
        "--name", name,
    ]
    
    process = subprocess.Popen(
        update_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    stdout, stderr = process.communicate(input=value)
    
    if process.returncode == 0:
        print(f"   ✅ Updated existing secret.")
        return True
    
    # If update failed (likely doesn't exist), try create
    print(f"   ⚠️  Update failed (not found?), trying create...")
    
    create_cmd = [
        "npx", "wrangler", "secrets-store", "secret", "create", STORE_ID,
        "--name", name,
        "--scopes", "workers"
    ]
    
    process = subprocess.Popen(
        create_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    stdout, stderr = process.communicate(input=value)

    if process.returncode != 0:
        print(f"   ❌ Failed: {stderr}")
        return False
        
    print(f"   ✅ Created new secret.")
    return True

def main():
    print("🔐 Cloudflare Secrets Provisioner")
    print("================================")
    print(f"Store ID: {STORE_ID}")
    print("For each secret, enter a value to update/create it.")
    print("Press ENTER (empty) to skip if it's already set correctly.\n")

    for binding, secret_name, desc in SECRETS:
        print(f"👉 {secret_name} ({desc})")
        val = input("   Value: ").strip()
        
        if not val:
            print("   ⏭️  Skipped.")
            continue
            
        upload_secret(secret_name, val)
        print("")

    print("🎉 Done! Try 'pnpm run deploy' now.")

if __name__ == "__main__":
    main()
