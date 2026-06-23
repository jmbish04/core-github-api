#!/usr/bin/env bash
# scripts/check-agent-delegation.sh
#
# CI guard: enforces agent-specialist delegation rule.
# See: .agent/rules/agent-specialist-delegation.md
# See: docs/20260417/standardize_agents/v7/PRD.md
#
# Exit 1 if any agent outside its sanctioned directory imports a specialist SDK.

set -euo pipefail

AGENTS_DIR="src/backend/src/ai/agents"
FAIL=0

echo "🔍 Checking agent-specialist delegation rule..."
echo ""

# 1. Only CloudflareAgent may import MCP client
MCP_VIOLATIONS=$(grep -rn "from ['\"]@/ai/mcp/mcp-client" "$AGENTS_DIR" | grep -v "chat/CloudflareAgent" || true)
if [ -n "$MCP_VIOLATIONS" ]; then
  echo "❌ MCP client imported outside chat/CloudflareAgent/:"
  echo "$MCP_VIOLATIONS"
  FAIL=1
fi

# 2. Only CloudflareAgent may import @/ai/mcp/* transport modules (excluding @/ai/mcp/tools/* which are tool defs)
MCP_WILDCARD=$(grep -rn "from ['\"]@/ai/mcp/" "$AGENTS_DIR" | grep -v "chat/CloudflareAgent" | grep -v "@/ai/mcp/tools/" || true)
if [ -n "$MCP_WILDCARD" ]; then
  echo "❌ @/ai/mcp/* transport imported outside chat/CloudflareAgent/:"
  echo "$MCP_WILDCARD"
  FAIL=1
fi

# 3. Only GithubAgent may import Octokit or services/octokit
OCTOKIT_VIOLATIONS=$(grep -rn "from ['\"]@octokit\|from ['\"]@services/octokit\|from ['\"]@/services/octokit\|new Octokit\|getOctokit" "$AGENTS_DIR" | grep -v "backend/GithubAgent" || true)
if [ -n "$OCTOKIT_VIOLATIONS" ]; then
  echo "❌ Octokit imported outside backend/GithubAgent/:"
  echo "$OCTOKIT_VIOLATIONS"
  FAIL=1
fi

# 4. No agent outside CloudflareAgent calls rewriteQuestionForMCP (code, not comments)
REWRITE_VIOLATIONS=$(grep -rn "rewriteQuestionForMCP" "$AGENTS_DIR" | grep -v "chat/CloudflareAgent" | grep -v "^.*:.*//.*rewriteQuestionForMCP" || true)
if [ -n "$REWRITE_VIOLATIONS" ]; then
  echo "❌ rewriteQuestionForMCP called outside chat/CloudflareAgent/:"
  echo "$REWRITE_VIOLATIONS"
  FAIL=1
fi

# 5. CoordinatorAgent imports no service SDKs (code, not comments)
COORDINATOR_VIOLATIONS=$(grep -rn "^import.*from ['\"]@/cloudflare\|^import.*from ['\"]@/ai/mcp\|^import.*from ['\"]@octokit\|^import.*from ['\"]@services\|^import.*from ['\"]@/services" "$AGENTS_DIR/chat/CoordinatorAgent" 2>/dev/null || true)
if [ -n "$COORDINATOR_VIOLATIONS" ]; then
  echo "❌ CoordinatorAgent imports service SDKs (must be a pure router):"
  echo "$COORDINATOR_VIOLATIONS"
  FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "💡 Fix: use getPeerAgent(env.FOO_AGENT).method() instead of direct imports."
  echo "📖 See: .agent/rules/agent-specialist-delegation.md"
  exit 1
fi

echo "✅ All agent delegation checks passed."
