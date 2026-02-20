#!/bin/bash
# scripts/verify_secrets.sh

echo "🔍 Verifying Secrets on Remote Store..."
echo "Store ID: 8c42fa70938644e0a8a109744467375f"
echo "---------------------------------------------------"

# Define the expected secrets mapped in wrangler.jsonc
declare -a SECRETS=(
    "CORE_GITHUB_API_GITHUB_CLIENT_ID"
    "CORE_GITHUB_API_GITHUB_SECRET"
    "CORE_GITHUB_API_GITHUB_APP_ID"
    "GITHUB_TOKEN"
    "CLOUDFLARE_API_TOKEN"
    "CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY_PT1"
    "CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY_PT2"
    "CORE_GITHUB_API_GITHUB_APP_PRIVATE_KEY_PT3"
    "WORKER_API_KEY"
    "CLOUDFLARE_AI_GATEWAY_TOKEN"
)

# Fetch the list of secrets from the store
# We use a temporary file to store the list output for checking
echo "Fetching secret list from Cloudflare..."
wrangler secrets-store secret list 8c42fa70938644e0a8a109744467375f --remote --per-page 100 > .secret_list_check.txt 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Failed to list secrets. Please check your permissions."
    cat .secret_list_check.txt
    rm .secret_list_check.txt
    exit 1
fi

echo "✅ Secret list fetched. Checking against requirements..."
echo ""

MISSING_COUNT=0

for secret in "${SECRETS[@]}"; do
    if grep -q "$secret" .secret_list_check.txt; then
        echo "✅ FOUND: $secret"
    else
        echo "❌ MISSING: $secret"
        MISSING_COUNT=$((MISSING_COUNT+1))
    fi
done

echo ""
echo "---------------------------------------------------"
if [ $MISSING_COUNT -eq 0 ]; then
    echo "🎉 All required secrets appear to be present!"
    echo "If deployment still fails with code 10021, check:"
    echo "1. The values inside the secrets are correct."
    echo "2. The binding names in wrangler.jsonc match your code."
    echo "3. The Cloudflare API Token has 'Secrets Store: Read' permission."
else
    echo "⚠️  Found $MISSING_COUNT missing secrets."
    echo "Please use './scripts/provision_secrets.sh' or the dashboard to add them."
fi

rm .secret_list_check.txt
