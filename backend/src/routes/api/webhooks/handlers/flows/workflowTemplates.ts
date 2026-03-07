/**
 * @file src/flows/workflowTemplates.ts
 * @description GitHub Actions workflow templates for automated repository setup within the Cloudflare ecosystem.
 * This module provides the foundational CI/CD string literals necessary to automate PR review processes,
 * deploy Hono/Drizzle/Astro applications to Cloudflare Workers using Wrangler, and invoke AI agents like Jules.
 * Relevant AI System Contexts:
 * - https://developers.cloudflare.com/workers/llms-full.txt
 * - https://developers.cloudflare.com/pages/llms-full.txt
 * @owner AI-Builder
 */

/**
 * GitHub Action workflow template for extracting and summarizing PR comments.
 * @description
 * This workflow leverages the GitHub CLI and `jq` to parse issue and PR comments,
 * filtering out bot commands and markdown image badges. It outputs a `cleaned_comments.md` 
 * file intended to be consumed by upstream LLM coding agents.
 * @type {string}
 */
export const PR_COMMENT_EXTRACTOR_WORKFLOW = `name: Extract and Summarize PR Comments

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

permissions:
  pull-requests: write
  issues: read
  contents: read

concurrency:
  group: pr-comment-\${{ github.event.issue.number || github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  summarize-comments:
    if: >
      github.event.comment.user.login != github.repository_owner &&
      github.event.issue.pull_request != null
    runs-on: ubuntu-latest

    steps:
      - name: Wait 30 seconds to batch comments
        run: sleep 30

      - name: Checkout
        uses: actions/checkout@v4

      - name: Install jq and gh
        run: sudo apt-get update && sudo apt-get install -y jq gh

      - name: Extract and sanitize PR comments
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          REPO: \${{ github.repository }}
          PR_NUMBER: \${{ github.event.issue.number || github.event.pull_request.number }}
        run: |
          echo "# Extracting comments for PR #$PR_NUMBER"

          # Fetch PR discussion comments (excluding you)
          gh api -H "Accept: application/vnd.github.v3+json" \\
            "/repos/$REPO/issues/$PR_NUMBER/comments" --paginate |
          jq -r '
            .[]
            | select(.user.login != "\${{ github.repository_owner }}")
            | .body
          ' > all_comments_raw.txt

          # Fetch inline code review comments
          gh api -H "Accept: application/vnd.github.v3+json" \\
            "/repos/$REPO/pulls/$PR_NUMBER/comments" --paginate |
          jq -r '
            .[]
            | select(.user.login != "\${{ github.repository_owner }}")
            | "### File: \\(.path)\\nLine: \\(.line // "N/A")\\n\\n" + (.body // "")
          ' >> all_comments_raw.txt

          # Clean text: remove badges, slash commands, bot names, etc.
          sed -E -i \\
            -e 's|!\\[[^]]*\\]\\([^)]*\\)||g' \\
            -e 's|@[A-Za-z0-9._-]+\\[bot\\]||g' \\
            -e 's|/gemini[^\\n]*||gi' \\
            -e 's|/colby[^\\n]*||gi' \\
            -e 's|@jules||gi' \\
            -e '/^$/N;/^\\n$/D' \\
            all_comments_raw.txt

          # Add a header
          {
            echo "# 🧠 Cleaned PR Feedback Summary"
            echo ""
            cat all_comments_raw.txt
          } > cleaned_comments.md

          echo "---- Cleaned Comments Preview ----"
          head -n 40 cleaned_comments.md || true

      - name: Post cleaned summary as PR comment
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          REPO: \${{ github.repository }}
          PR_NUMBER: \${{ github.event.issue.number || github.event.pull_request.number }}
        run: |
          gh pr comment "$PR_NUMBER" --repo "$REPO" --body-file cleaned_comments.md
`

/**
 * GitHub Action workflow template for deploying Cloudflare Workers.
 * @description
 * Facilitates the continuous deployment of our Hono + Drizzle API layer directly 
 * to Cloudflare edge nodes.
 * @type {string}
 */
export const CLOUDFLARE_DEPLOY_WORKFLOW = `name: Deploy Worker
on:
  push:
    branches:
      - main
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      
      - name: Build & Deploy Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
`

/**
 * GitHub Action workflow template for auto-applying AI code suggestions.
 * @description
 * Automatically detects and isolates \`suggestion\` blocks authored by the
 * \`gemini-code-assist[bot]\` on PR review comments, converting them into standard 
 * git patches.
 * @type {string}
 */
export const AUTO_APPLY_GEMINI_WORKFLOW = `name: Auto-Apply Gemini Suggestions

on:
  pull_request_review_comment:
    types: [created]

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-apply:
    if: github.event.comment.user.login == 'gemini-code-assist[bot]'
    runs-on: ubuntu-latest

    steps:
      - name: Wait 10 seconds to batch Gemini comments
        run: sleep 10

      - name: Checkout PR branch
        uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.ref }}
          repository: \${{ github.repository }}
          token: \${{ secrets.GITHUB_TOKEN }}

      - name: Fetch and process comment
        id: process
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          COMMENT_ID: \${{ github.event.comment.id }}
          REPO: \${{ github.repository }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
        run: |
          echo "🔍 Checking comment $COMMENT_ID from Gemini..."
          BODY=$(gh api /repos/$REPO/pulls/comments/$COMMENT_ID --jq '.body')
          FILE=$(gh api /repos/$REPO/pulls/comments/$COMMENT_ID --jq '.path')
          LINE=$(gh api /repos/$REPO/pulls/comments/$COMMENT_ID --jq '.line')

          echo "📄 File: $FILE (line $LINE)"
          echo "$BODY" | awk '/\\\`\\\`\\\`suggestion/,/\\\`\\\`\\\`/' | sed '/\\\`\\\`\\\`/d' > suggestion.patch

          if [ ! -s suggestion.patch ]; then
            echo "no_suggestion=true" >> $GITHUB_OUTPUT
            exit 0
          fi

          echo "no_suggestion=false" >> $GITHUB_OUTPUT
          echo "✅ Suggestion found:"
          cat suggestion.patch

          # Dry-run apply
          echo "🧪 Dry-run applying suggestion..."
          git apply --check suggestion.patch && echo "patch_valid=true" >> $GITHUB_OUTPUT || echo "patch_valid=false" >> $GITHUB_OUTPUT

      - name: Comment result on PR
        if: always()
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          REPO: \${{ github.repository }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
          COMMENT_ID: \${{ github.event.comment.id }}
          NO_SUGGESTION: \${{ steps.process.outputs.no_suggestion }}
          PATCH_VALID: \${{ steps.process.outputs.patch_valid }}
        run: |
          if [ "$NO_SUGGESTION" = "true" ]; then
            gh pr comment "$PR_NUMBER" --repo "$REPO" --body "✅ Action ran successfully but no \\\`\\\`\\\`suggestion\\\`\\\`\\\` code blocks were detected in Gemini's comment."
            exit 0
          fi

          if [ "$PATCH_VALID" = "false" ]; then
            gh pr comment "$PR_NUMBER" --repo "$REPO" --body "⚠️ Gemini suggestion found but could not apply cleanly. Please review the patch manually from comment $COMMENT_ID."
            exit 0
          fi

          # Apply, commit, and push the patch
          echo "🚀 Applying patch..."
          git apply suggestion.patch
          git add .
          git config user.name "auto-gemini-applier"
          git config user.email "bot@users.noreply.github.com"
          git commit -m "chore: apply Gemini suggestion from comment $COMMENT_ID"
          git push origin HEAD

          # Post confirmation with guidance
          cat <<EOF | gh pr comment "$PR_NUMBER" --repo "$REPO" --body-file -
          ✅ **Gemini suggestion applied automatically!**

          Applied suggestion from comment $COMMENT_ID and pushed to this PR.

          **Next Steps:**
          - Review the auto-applied changes
          - If the suggestion was incorrect, you can revert this commit
          - To disable auto-apply for future suggestions, add \\\`[skip-auto-apply]\\\` to your PR description

          ---
          _Automated by auto-gemini-applier workflow_
          EOF
`

/**
 * GitHub Action composite template for invoking the Jules AI agent.
 * @description
 * Defines a reusable composite action to execute the Jules API against a specific PR or branch.
 * @type {string}
 */
export const JULES_INVOKE_ACTION = `name: Jules Invoke
description: 'Invoke Jules, an AI-powered coding agent, to perform tasks on your codebase.'

branding:
  icon: 'code'
  color: 'purple'

inputs:
  prompt:
    description: 'The prompt to pass to Jules'
    required: true
    type: string
  include_last_commit:
    description: 'Whether to pass content of the last commit'
    type: boolean
    default: false
  include_commit_log:
    description: 'Whether to pass commit history'
    type: boolean
    default: false
  starting_branch:
    description: 'The branch for Jules to start from'
    required: false
    type: string
    default: 'main'
  jules_api_key:
    description: 'The Jules API key to use for authentication'
    required: true
    type: string

runs:
  using: "composite"
  steps:
    - uses: actions/checkout@v5
      with:
        fetch-depth: 30

    - name: Create initial prompt
      env:
        USER_PROMPT: \${{ inputs.prompt }}
      shell: bash
      run: |
        echo "$USER_PROMPT" > prompt.txt

    - name: Save last commit content
      if: \${{ inputs.include_last_commit == 'true' }}
      shell: bash
      run: |
        echo -e '\\n\\nContent of the latest commit (in the format of \\\`git show\\\`):' >> prompt.txt
        echo '\\\`\\\`\\\`' >> prompt.txt
        git show   >> prompt.txt
        echo '\\\`\\\`\\\`' >> prompt.txt

    - name: Save git log
      if: \${{ inputs.include_commit_log == 'true' }}
      shell: bash
      run: |
        echo -e '\\n\\nLog of the last 20 commits (in the format of \\\`git log --stat\\\`):' >> prompt.txt
        echo '\\\`\\\`\\\`'         >> prompt.txt
        git log -20 --stat >> prompt.txt
        echo '\\\`\\\`\\\`'         >> prompt.txt

    - name: Assemble Jules payload
      shell: bash
      run: |
        jq -n --arg jules_prompt "$(cat prompt.txt)" --arg starting_branch "\${{ inputs.starting_branch }}" --arg repo_full_name "\${{ github.repository }}" '{
            "prompt": $jules_prompt,
            "sourceContext": {
              "source": "sources/github/\\($repo_full_name)",
              "githubRepoContext": {
                "startingBranch": $starting_branch
              }
            },
            "requirePlanApproval": false,
            "automationMode": "AUTO_CREATE_PR"
          }' > jules_payload.json

    - name: Invoke Jules
      shell: bash
      run: |
        curl 'https://jules.googleapis.com/v1alpha/sessions' \\
          -X POST \\
          -H "Content-Type: application/json" \\
          -H "X-Goog-Api-Key: \${{ inputs.jules_api_key }}" \\
          -d @jules_payload.json
`

/**
 * GitHub Action workflow template for automated Jules docstring generation.
 * @description
 * Automatically triggers the Jules invocation action when a PR is opened or synchronized.
 * It passes a specifically engineered prompt requiring the AI to map module documentation 
 * to OpenAPI v3.1.0, Hono, Drizzle, and Shadcn UI architectures.
 * @type {string}
 */
export const JULES_DOCSTRINGS_WORKFLOW = `name: Generate AI-Optimized Docstrings

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  jules-docstrings:
    name: Jules PR Docstring Patcher
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Extract Branch Name
        id: extract_branch
        shell: bash
        run: echo "branch=\${GITHUB_HEAD_REF:-\${GITHUB_REF#refs/heads/}}" >> $GITHUB_OUTPUT

      - name: Invoke Jules for Docstrings
        uses: ./.github/actions/jules-invoke
        with:
          prompt: |
            Analyze the files modified in this pull request. For each modified file, seamlessly patch in comprehensive docstrings optimized specifically for LLM coding agents.

            Strict Implementation Requirements:
            1. File-Level Context: Insert a top-level JSDoc/TSDoc comment block explaining the module's exact purpose, its role in our architecture (e.g., Cloudflare Workers routing, Hono API layer, Drizzle/D1 Data model, or Shadcn UI component), and any core dependencies.
            2. Block-Level Precision: Add detailed JSDoc to every exported function, class, Zod schema, and Hono route.
            3. AI Optimization: Explicitly define types, parameters, return objects, edge-case handling, and AI Gateway fallbacks if applicable. Embed OpenAPI v3.1.0 specifications for API endpoints where relevant.
            4. Pure Documentation: You must NOT alter any functional code, logic, or imports. Only inject or refine documentation blocks.
          include_last_commit: true
          include_commit_log: true
          starting_branch: \${{ steps.extract_branch.outputs.branch }}
          jules_api_key: \${{ secrets.JULES_API_KEY }}
`

/**
 * Interface defining the strict structure of an injectable workflow template.
 * @interface WorkflowTemplate
 * @property {string} path - The relative repository path where the GitHub Action YAML will be instantiated (e.g., '.github/workflows/deploy.yml').
 * @property {string} content - The raw string representation of the workflow schema.
 * @property {string} description - A human and AI-readable description defining the trigger and resulting action.
 */
export interface WorkflowTemplate {
  path: string
  content: string
  description: string
}

/**
 * A standard registry array of default CI/CD workflows to be injected into newly scaffolded repositories.
 * Now updated to include the Jules AI invocation templates.
 * @type {WorkflowTemplate[]}
 */
export const DEFAULT_WORKFLOWS: WorkflowTemplate[] = [
  {
    path: '.github/workflows/pr-comment-extractor.yml',
    content: PR_COMMENT_EXTRACTOR_WORKFLOW,
    description: 'Extracts and summarizes PR comments for AI bot consumption'
  },
  {
    path: '.github/workflows/deploy-worker.yml',
    content: CLOUDFLARE_DEPLOY_WORKFLOW,
    description: 'Deploys Cloudflare Worker on push to main branch'
  },
  {
    path: '.github/workflows/auto-apply-gemini.yml',
    content: AUTO_APPLY_GEMINI_WORKFLOW,
    description: 'Automatically applies code suggestions from Gemini bot'
  },
  {
    path: '.github/actions/jules-invoke/action.yml',
    content: JULES_INVOKE_ACTION,
    description: 'Composite action to invoke Jules AI coding agent'
  },
  {
    path: '.github/workflows/jules-docstrings.yml',
    content: JULES_DOCSTRINGS_WORKFLOW,
    description: 'Automated Jules workflow to generate AI-optimized docstrings on PRs'
  }
]

/**
 * Evaluates target repository contents to determine if Cloudflare deployment infrastructure is required.
 * @description
 * Scans an array of top-level repository file paths looking for standard Wrangler 
 * configuration files used by Cloudflare Workers and Pages.
 * @param {string[]} files - An array of file names/paths present in the root directory.
 * @returns {boolean} Returns \`true\` if a wrangler configuration file is present, triggering the inclusion of the deployment workflow.
 */
export function shouldIncludeCloudflareWorkflow(files: string[]): boolean {
  return files.some(file => 
    file === 'wrangler.toml' || 
    file === 'wrangler.jsonc' ||
    file === 'wrangler.json'
  )
}