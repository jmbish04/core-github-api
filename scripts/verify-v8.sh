#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# scripts/verify-v8.sh — V8 Agents SDK Migration Verification Harness
#
# Enforces architectural constraints defined in PRD.md and TASKS.json.
# Run after each commit to confirm compliance before deployment.
#
# Exit codes:
#   0 — All checks passed
#   1 — One or more constraints violated
#
# Usage:
#   chmod +x scripts/verify-v8.sh && ./scripts/verify-v8.sh
#
# @see docs/20260417/standardize_agents/v8/PRD.md
# @see V8-12 in TASKS.json
# ────────────────────────────────────────────────────────────────────────────

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; ((WARN++)); }

echo ""
echo "════════════════════════════════════════════════════════"
echo " V8 Agents SDK Migration — Verification Harness"
echo "════════════════════════════════════════════════════════"
echo ""

# ── 1. No "latest" in package.json ────────────────────────────────────────
echo "▸ V8-01: Dependency Pinning"
LATEST_COUNT=$(grep -c '"latest"' package.json || true)
LATEST_COUNT=$(echo "$LATEST_COUNT" | tr -d '[:space:]')
if [ "$LATEST_COUNT" = "0" ] || [ -z "$LATEST_COUNT" ]; then
  pass "No \"latest\" version specifiers in package.json"
else
  fail "$LATEST_COUNT \"latest\" specifiers remain in package.json"
fi

# ── 2. Required V8 packages installed ─────────────────────────────────────
echo ""
echo "▸ V8-01: Required packages"
for pkg in "agents" "@cloudflare/think" "@cloudflare/codemode" "workers-ai-provider"; do
  if [ -d "node_modules/.pnpm" ] && ls node_modules/.pnpm | grep -q "$(echo $pkg | sed 's/@//' | sed 's/\//-/')"; then
    pass "$pkg installed"
  elif [ -d "node_modules/$pkg" ]; then
    pass "$pkg installed"
  else
    fail "$pkg NOT installed"
  fi
done

# ── 3. Observability module under agent-support ───────────────────────────
echo ""
echo "▸ V8-02: Observability Module"
OBSDIR="src/backend/src/ai/providers/agent-support/observability"
if [ -f "$OBSDIR/index.ts" ] && [ -f "$OBSDIR/subscribers.ts" ]; then
  pass "Observability module at $OBSDIR"
else
  fail "Observability module missing at $OBSDIR"
fi

# Verify old location is removed
if [ -d "src/backend/src/ai/observability" ]; then
  fail "Stale observability dir at src/backend/src/ai/observability — must be removed"
else
  pass "No stale ai/observability directory"
fi

# Verify wired into boot path
if grep -q "registerObservability" src/backend/src/index.ts 2>/dev/null; then
  pass "registerObservability wired into boot path"
else
  fail "registerObservability NOT found in src/backend/src/index.ts"
fi

# ── 4. BaseThinkAgent shim ────────────────────────────────────────────────
echo ""
echo "▸ V8-04: BaseThinkAgent"
if [ -f "src/backend/src/ai/providers/agent-support/base-think-agent.ts" ]; then
  pass "BaseThinkAgent shim exists"
else
  fail "BaseThinkAgent shim missing"
fi

# Verify exported from barrel
if grep -q "BaseThinkAgent" src/backend/src/ai/providers/agent-support/index.ts 2>/dev/null; then
  pass "BaseThinkAgent exported from barrel"
else
  fail "BaseThinkAgent NOT exported from barrel"
fi

# chatRecovery must be false
if grep -q "chatRecovery.*false" src/backend/src/ai/providers/agent-support/base-think-agent.ts 2>/dev/null; then
  pass "chatRecovery = false (pending HITL characterization)"
else
  fail "chatRecovery is NOT explicitly false — must be disabled"
fi

# ── 5. Browser tools wrapper ─────────────────────────────────────────────
echo ""
echo "▸ V8-06: Browser Tools"
if [ -f "src/backend/src/ai/tools/browser-tools.ts" ]; then
  pass "browser-tools.ts wrapper exists"
else
  fail "browser-tools.ts wrapper missing"
fi

# BROWSER binding in wrangler
if grep -q '"BROWSER"' wrangler.jsonc 2>/dev/null; then
  pass "BROWSER binding configured in wrangler.jsonc"
else
  fail "BROWSER binding missing in wrangler.jsonc"
fi

# LOADER binding in wrangler
if grep -q '"LOADER"' wrangler.jsonc 2>/dev/null; then
  pass "LOADER binding configured in wrangler.jsonc"
else
  fail "LOADER binding missing in wrangler.jsonc"
fi

# Specialist invariant: browser-tools must NOT import from @/ai/mcp or @octokit
if grep -E "^import .* from ['\"]@/ai/mcp|^import .* from ['\"]@octokit|require\(['\"]@/ai/mcp|require\(['\"]@octokit" src/backend/src/ai/tools/browser-tools.ts 2>/dev/null; then
  fail "browser-tools.ts violates specialist silo — imports from MCP or Octokit"
else
  pass "browser-tools.ts respects specialist silo (no MCP/Octokit imports)"
fi

# ── 6. Codemode wrapper ──────────────────────────────────────────────────
echo ""
echo "▸ V8-09: Codemode Gating"
if [ -f "src/backend/src/ai/tools/codemode-tool.ts" ]; then
  pass "codemode-tool.ts wrapper exists"
else
  fail "codemode-tool.ts wrapper missing"
fi

if [ -f "src/backend/src/ai/mcp/registry-codemode-filter.ts" ]; then
  pass "registry-codemode-filter.ts exists"
else
  fail "registry-codemode-filter.ts missing"
fi

# CODEMODE_ENABLED gate must exist
if grep -q "CODEMODE_ENABLED" src/backend/src/ai/tools/codemode-tool.ts 2>/dev/null; then
  pass "CODEMODE_ENABLED gate present in codemode-tool.ts"
else
  fail "CODEMODE_ENABLED gate missing — codemode is ungated (CRITICAL)"
fi

# MCP tools must have safety annotation fields
if grep -q "needsApproval" src/backend/src/ai/mcp/tools.ts 2>/dev/null; then
  pass "MCPTool interface has codemode safety annotations"
else
  fail "MCPTool interface missing safety annotations (needsApproval, writesToGitHub, mutatesCloudflare)"
fi

# ── 7. Health metrics tap ─────────────────────────────────────────────────
echo ""
echo "▸ V8-11: Health Metrics Tap"
if [ -f "src/backend/src/ai/providers/agent-support/health/metrics-tap.ts" ]; then
  pass "metrics-tap.ts exists"
else
  fail "metrics-tap.ts missing"
fi

# ── 8. BaseChatAgent NOT modified ─────────────────────────────────────────
echo ""
echo "▸ Invariant: BaseChatAgent preserved"
if git diff HEAD -- src/backend/src/ai/providers/agent-support/base-chat-agent.ts 2>/dev/null | grep -q "^[+-]" 2>/dev/null; then
  warn "base-chat-agent.ts has uncommitted changes — verify they are intentional"
else
  pass "base-chat-agent.ts unchanged"
fi

# ── 9. TypeScript compilation ─────────────────────────────────────────────
echo ""
echo "▸ TypeScript Compilation"
V8_PATTERN="observability\|base-think\|browser-tools\|codemode\|metrics-tap"
TSC_ERRORS=$(npx tsc --noEmit 2>&1 | grep -c "$V8_PATTERN" || true)
TSC_ERRORS=$(echo "$TSC_ERRORS" | tr -d '[:space:]')
if [ "$TSC_ERRORS" = "0" ] || [ -z "$TSC_ERRORS" ]; then
  pass "V8 files compile without errors"
else
  fail "$TSC_ERRORS type error(s) in V8 files"
fi

# ── 10. Audit document exists ─────────────────────────────────────────────
echo ""
echo "▸ V8-01: Audit Document"
if [ -f "docs/20260417/standardize_agents/v8/AGENTS_PACKAGE_AUDIT.md" ]; then
  pass "AGENTS_PACKAGE_AUDIT.md exists"
else
  fail "AGENTS_PACKAGE_AUDIT.md missing"
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo -e " Results: ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}  ${YELLOW}$WARN warnings${NC}"
echo "════════════════════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}VERIFICATION FAILED — $FAIL constraint(s) violated.${NC}"
  exit 1
fi

echo -e "${GREEN}ALL CHECKS PASSED ✓${NC}"
exit 0
