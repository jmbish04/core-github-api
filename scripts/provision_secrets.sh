#!/bin/bash

# Store ID from wrangler.jsonc
STORE_ID="8c42fa70938644e0a8a109744467375f"

echo "========================================================"
echo "      Cloudflare Secrets Store Provisioning Tool"
echo "========================================================"
echo "Target Store ID: $STORE_ID"
echo ""
echo "This script will help you add the missing secrets required for deployment."
echo "For each secret, paste the value and press Enter."
echo "Press Ctrl+C to exit at any time."
echo "========================================================"
echo ""

# Function to prompt and put secret
put_secret() {
    local secret_name=$1
    local description=$2
    
    echo "--------------------------------------------------------"
    echo "Secret: $secret_name"
    echo "Description: $description"
    
    # Check if secret already exists (optional, simply overwriting/putting is fine usually, but listing takes time)
    # We skip check for speed.
    
    read -sp "Enter value: " secret_value
    echo ""
    
    if [ -z "$secret_value" ]; then
        echo "⚠️  Skipping $secret_name (empty input)"
    else
        echo "$secret_value" | npx wrangler secrets-store secret put "$STORE_ID" "$secret_name"
        echo "✅  Updated $secret_name"
    fi
}

# List of required secrets based on wrangler.jsonc and secrets.txt analysis

# 1. CORE_GITHUB_API_GITHUB_SECRET (Likely confirmed missing or invalid)
put_secret "CORE_GITHUB_API_GITHUB_SECRET" "GitHub OAuth Client Secret"

# 2. GH_TOKEN_CORE_GITHUB_WORKER (Creating dedicated secret to avoid ambiguity)
put_secret "GH_TOKEN_CORE_GITHUB_WORKER" "GitHub Personal Access Token (PAT)"

# 3. CLOUDFLARE_API_TOKEN (Confirmed present, but ensuring coverage just in case)
# put_secret "CLOUDFLARE_API_TOKEN" "Cloudflare API Token"

# 4. WORKER_API_KEY (Confirmed present)
# put_secret "WORKER_API_KEY" "API Key for protecting this Worker"

# 5. CLOUDFLARE_AI_GATEWAY_TOKEN (Confirmed present)
# put_secret "CLOUDFLARE_AI_GATEWAY_TOKEN" "Cloudflare AI Gateway Token"

# Excluded (Already exist in store):
# - CORE_GITHUB_API_GITHUB_CLIENT_ID
# - CORE_GITHUB_API_GITHUB_APP_ID
# - CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY_PT1
# - CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY_PT2
# - CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY_PT3

echo ""
echo "========================================================"
echo "🎉  Provisioning complete!"
echo "You can now run 'pnpm run deploy' to deploy the worker."
