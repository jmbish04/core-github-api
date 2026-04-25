#!/bin/bash

# Create target directory
TARGET_DIR="docs/20260404/artifacts/ai-agent-refactor"
mkdir -p "$TARGET_DIR"

# AI brain artifact paths for this session
BRAIN_DIR="/Users/126colby/.gemini/antigravity/brain/8e50f5b6-f50e-4be4-94b2-bdbdf25b75f1"

# Copy the artifacts
echo "Copying artifacts to $TARGET_DIR..."

cp "$BRAIN_DIR/implementation_plan.md" "$TARGET_DIR/implementation_plan.md"
cp "$BRAIN_DIR/walkthrough.md" "$TARGET_DIR/walkthrough.md"
cp "$BRAIN_DIR/AUDIT_REPORT.md" "$TARGET_DIR/audit_report.md"

echo "Done!"
