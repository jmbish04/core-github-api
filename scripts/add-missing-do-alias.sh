#!/bin/bash
# Iteratively try to deploy, adding missing DO aliases on each failure
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd /Volumes/Projects/workers/core-github-api

EXPORTS_FILE="src/backend/src/ai/agents/exports.ts"
MAX_ATTEMPTS=20

for i in $(seq 1 $MAX_ATTEMPTS); do
  echo "=== Attempt $i ==="
  OUTPUT=$(pnpm run deploy:only 2>&1)
  
  if echo "$OUTPUT" | grep -q "Your Worker is ready!"; then
    echo "✅ Deployment succeeded!"
    exit 0
  fi
  
  # Extract missing class name
  MISSING=$(echo "$OUTPUT" | grep -o "does not export class '[^']*'" | sed "s/does not export class '//;s/'//")
  
  if [ -z "$MISSING" ]; then
    echo "❌ Failed but no missing class found. Last output:"
    echo "$OUTPUT" | tail -15
    exit 1
  fi
  
  echo "Missing: $MISSING → Adding alias"
  
  # Add the alias before the Workflows section
  sed -i '' "/\/\/ ── Workflows/i\\
export { OrchestratorAgent as $MISSING } from './backend/OrchestratorAgent';
" "$EXPORTS_FILE"
  
done

echo "❌ Exceeded $MAX_ATTEMPTS attempts"
exit 1
