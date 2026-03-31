#!/bin/bash

# ==============================================================================
# Codex File Audit Script
# highly optimized cross-branch file existence checker
# ==============================================================================

FILES=(
  "backend/src/ai/agents/implementer.ts"
  "backend/src/automations/issues/SlashCommand.ts"
  "backend/src/automations/push/GardenerPush.ts"
  "backend/src/automations/push/agents/implement.ts"
  "backend/src/automations/push/auditor.ts"
  "backend/src/automations/push/commands/extract.ts"
  "backend/src/automations/push/commands/registry.ts"
  "backend/src/automations/push/commands/standardize.ts"
  "backend/src/automations/push/commands/test.ts"
  "backend/src/automations/push/fixers/all.ts"
  "backend/src/automations/push/fixers/comments.ts"
  "backend/src/automations/push/fixers/types.ts"
  "backend/src/automations/push/ops/container.ts"
  "backend/src/automations/push/ops/sandbox.ts"
  "backend/src/automations/push/orchestrator.ts"
  "backend/src/automations/push/router.ts"
  "backend/src/automations/repository/RepoStandardization.ts"
  "backend/src/automations/repository/standardization/index.ts"
  "backend/src/automations/repository/standardization/rules.ts"
  "backend/src/routes/api/ops/standards.ts"
  "backend/src/ai/mcp/tools/github/github.ts"
  "backend/src/automations/issues/BugHunter.ts"
  "backend/src/automations/issues/JulesAutoFix.ts"
  "backend/src/automations/issues/TaskSync.ts"
  "backend/src/automations/issues/bug-hunter-workflow.ts"
  "backend/src/automations/pr/AgentTagger.ts"
  "backend/src/automations/pr/BuildAnalyzer.ts"
  "backend/src/automations/pr/DocstringGenerator.ts"
  "backend/src/automations/pr/GeminiReview.ts"
  "backend/src/automations/pr/PRIngest.ts"
  "backend/src/automations/pr/PRReviewExtraction.ts"
  "backend/src/automations/pr/docstrings.ts"
  "backend/src/automations/push/JulesStandardsPush.ts"
  "backend/src/automations/push/gardener/commands/standardize.ts"
  "backend/src/automations/push/gardener/index.ts"
  "backend/src/automations/repository/RepoSync.ts"
  "backend/src/automations/repository/StatsUpdate.ts"
  "backend/src/automations/repository/constants.ts"
  "backend/src/automations/security/LeakPlumber.ts"
  "backend/src/automations/shared/statusMapper.ts"
  "backend/src/automations/telemetry/TelemetryIngestion.ts"
  "backend/src/core/AutomationRegistry.ts"
  "backend/src/core/BaseAutomation.ts"
  "backend/src/db/schemas/webhooks/automations.ts"
  "backend/src/routes/api/frontend/settings.ts"
  "backend/src/routes/api/ops/workflows.ts"
  "backend/src/routes/api/webhooks/index.ts"
  "backend/src/services/docstrings.ts"
  "backend/src/services/github/pr-ingestion.ts"
  "backend/src/services/github/secrets-manager.ts"
  "backend/src/services/standardization.ts"
  "backend/src/services/standardization/agent-gen.ts"
  "backend/src/services/standardization/index.ts"
  "backend/src/services/standardization/mcp-sync.ts"
  "backend/src/services/standardization/secret-sync.ts"
  "backend/src/services/statusMapper.ts"
  "frontend/src/views/control/global/Workflows.tsx"
  "tests/flows.test.ts"
)

echo "Fetching branch trees into memory (this is fast)..."
MAIN_TREE=$(git ls-tree -r main --name-only 2>/dev/null)
JBS_TREE=$(git ls-tree -r jules-bug-smash --name-only 2>/dev/null)
FEAT_TREE=$(git ls-tree -r feat/modular-webhooks-and-strict-typing --name-only 2>/dev/null)

echo "Auditing Codex files..."
echo "----------------------------------------"

MISSING_COUNT=0

for f in "${FILES[@]}"; do
  # Prioritize checking main first, as that is the target state
  if echo "$MAIN_TREE" | grep -qx "$f"; then
    echo "✅ [main] $f"
  elif echo "$JBS_TREE" | grep -qx "$f"; then
    echo "⚠️  [jules-bug-smash ONLY] $f"
    MISSING_COUNT=$((MISSING_COUNT + 1))
  elif echo "$FEAT_TREE" | grep -qx "$f"; then
    echo "⚠️  [feat/modular... ONLY] $f"
    MISSING_COUNT=$((MISSING_COUNT + 1))
  else
    echo "❌ [MISSING GLOBALLY] $f"
    MISSING_COUNT=$((MISSING_COUNT + 1))
  fi
done

echo "----------------------------------------"
if [ "$MISSING_COUNT" -eq 0 ]; then
  echo "🎉 All files successfully merged to main."
else
  echo "⚠️  $MISSING_COUNT files are missing from main. Review required."
fi
