#!/usr/bin/env python3
import sys
import subprocess
import base64
import math
import os

STORE_ID = "8c42fa70938644e0a8a109744467375f"
SECRET_NAMES = [
    "CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY_PT1",
    "CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY_PT2",
    "CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY_PT3"
]

def get_input_key():
    print("🔑 Paste your GitHub App Private Key (PEM format) below.")
    print("   Press Ctrl+D (Linux/Mac) or Ctrl+Z (Windows) when finished:")
    try:
        lines = sys.stdin.readlines()
    except EOFError:
        pass
    return "".join(lines).strip()

def convert_to_pkcs8(pem_key):
    """Converts PKCS#1 (RSA PRIVATE KEY) to PKCS#8 (PRIVATE KEY) using openssl."""
    if "BEGIN PRIVATE KEY" in pem_key:
        print("✅ Key is already in PKCS#8 format.")
        return pem_key.encode('utf-8')

    if "BEGIN RSA PRIVATE KEY" not in pem_key:
        print("❌ Error: Key does not look like a PEM private key.")
        sys.exit(1)

    print("🔄 Converting PKCS#1 -> PKCS#8...")
    
    process = subprocess.Popen(
        ["openssl", "pkcs8", "-topk8", "-inform", "PEM", "-outform", "PEM", "-nocrypt"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    stdout, stderr = process.communicate(input=pem_key.encode('utf-8'))
    
    if process.returncode != 0:
        print(f"❌ OpenSSL Error:\n{stderr.decode('utf-8')}")
        sys.exit(1)
        
    return stdout

def upload_secret(name, value):
    print(f"☁️ Uploading {name}...")
    
    # Try updating first (if it exists)
    update_cmd = [
        "npx", "wrangler", "secrets-store", "secret", "update", STORE_ID, 
        "--name", name,
        # "--scopes", "workers" # Update doesn't take scopes apparently? If it fails, create will fix it.
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
        print("✅ Updated existing secret.")
        return True
    
    # If update failed (likely doesn't exist), try create
    print("⚠️  Update failed (likely doesn't exist), trying create...")
    
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
        print(f"❌ Upload Failed:\n{stderr}")
        return False
        
    print("✅ Created new secret.")
    return True

def main():
    print("🛠️  GitHub Private Key Fixer")
    print("============================")
    
    # Check for openssl
    try:
        subprocess.run(["openssl", "version"], check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ Error: 'openssl' command not found. Please install OpenSSL.")
        sys.exit(1)

    key_path = "/Volumes/Projects/_GITHUB_/core-github-api.2026-02-09.private-key.pem"
    if os.path.exists(key_path):
        print(f"📄 Found key file: {key_path}")
        with open(key_path, 'r') as f:
            pem_key = f.read().strip()
    else:
        print(f"⚠️  Key file not found at: {key_path}")
        pem_key = get_input_key()

    if not pem_key:
        print("❌ No key provided.")
        sys.exit(1)

    # Convert to PKCS#8
    pkcs8_bytes = convert_to_pkcs8(pem_key)
    pkcs8_str = pkcs8_bytes.decode('utf-8').strip()

    # Base64 Encode the WHOLE key
    # The worker logic does: atob(pt1 + pt2 + pt3) -> PEM
    # So we must btoa(PEM) -> Split
    
    b64_full = base64.b64encode(pkcs8_bytes).decode('utf-8')
    
    total_len = len(b64_full)
    chunk_size = math.ceil(total_len / 3)
    
    chunks = [b64_full[i:i+chunk_size] for i in range(0, total_len, chunk_size)]
    
    # Ensure exactly 3 chunks (pad with empty if needed, though unlikely for valid keys)
    while len(chunks) < 3:
        chunks.append("")
        
    print(f"\n📏 Total Base64 Length: {total_len}")
    print(f"✂️  Chunk Size: ~{chunk_size}")
    
    for i, secret_name in enumerate(SECRET_NAMES):
        chunk_val = chunks[i] if i < len(chunks) else ""
        print(f"   - Part {i+1}: {len(chunk_val)} chars -> {secret_name}")
        
    print("\n🚀 Ready to upload to Cloudflare Secrets Store?")
    # Auto-confirm for convenience if run programmatically, but still good to ask unless --yes
    confirm = input("   (y/n): ").lower().strip()
    
    if confirm != 'y':
        print("🚫 Cancelled.")
        sys.exit(0)
        
    for i, secret_name in enumerate(SECRET_NAMES):
        chunk_val = chunks[i] if i < len(chunks) else ""
        if not upload_secret(secret_name, chunk_val):
            print("❌ Stopping due to error.")
            sys.exit(1)
            
    print("\n✅ All parts uploaded successfully! Try deploying again.")

if __name__ == "__main__":
    main()
