#!/bin/bash
# scripts/add_missing_secret.sh

# Explicitly set store ID
STORE_ID="8c42fa70938644e0a8a109744467375f"

echo "🔐 Adding MISSING GitHub Client Secret..."
echo "Reason: Deployment failed with Code 10021 because 'CORE_GITHUB_API_GITHUB_SECRET' is missing from the store."
echo ""

read -sp "Enter GITHUB_CLIENT_SECRET (for binding CORE_GITHUB_API_GITHUB_SECRET): " SECRET_VALUE
echo ""

if [ -n "$SECRET_VALUE" ]; then
  echo "Putting CORE_GITHUB_API_GITHUB_SECRET..."
  echo "$SECRET_VALUE" | npx wrangler secrets-store secret put CORE_GITHUB_API_GITHUB_SECRET --store-id "$STORE_ID"
else
  echo "❌ Skipped."
fi

echo "✅ Done. Please try 'pnpm run deploy' after this."
