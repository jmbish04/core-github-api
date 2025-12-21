# Jules Bridge Integration

This document describes the Jules Bridge integration for handling `/colby ask jules` slash commands in GitHub PR comments.

## Overview

The Jules Bridge service connects GitHub Pull Request comments to the Jules AI coding agent via:
1. **GitHub Webhooks** → Receives `issue_comment.created` events
2. **Data Aggregation** → Fetches PR context and review comments
3. **Worker AI Synthesis** → Converts scattered comments into cohesive instructions
4. **Jules Dispatch** → Sends task to Jules Manager Worker via Service Binding

## Architecture

```
GitHub PR Comment (/colby ask jules ...)
    ↓
Webhook Handler (src/routes/webhook-handler.ts)
    ↓
Jules Bridge Service (src/services/jules-bridge.ts)
    ├── Fetch PR Context (Octokit)
    ├── Fetch Review Comments (Octokit)
    ├── Synthesize Prompt (Worker AI)
    └── Dispatch to Jules (Service Binding)
        ↓
    Jules Manager Worker (jules-mcp)
```

## Configuration

### 1. Service Binding (wrangler.jsonc)

```jsonc
{
  "services": [
    {
      "binding": "JULES_WORKER",
      "service": "jules-mcp"
    }
  ],
  "ai": {
    "binding": "AI"
  }
}
```

### 2. Environment Bindings (src/utils/hono.ts)

```typescript
export type Bindings = {
  // ... other bindings
  AI: Ai
  JULES_WORKER: Fetcher
}
```

## Usage

### Triggering Jules from a PR Comment

Add a comment to any Pull Request with the following format:

```
/colby ask jules <instruction>
```

**Examples:**

```
/colby ask jules fix all review comments
```

```
/colby ask jules implement the requested changes and update tests
```

```
/colby ask jules address the security concerns raised in the code review
```

### What Happens

1. **Immediate Response**: The bot posts a confirmation comment: "🤖 On it! Sending task to Jules..."

2. **Background Processing**:
   - Fetches PR details (title, branch, repo URL)
   - Retrieves all review comments
   - Uses Worker AI to synthesize comments into a structured prompt
   - Dispatches task to Jules Worker with full context

3. **Jules Execution**: The Jules Manager Worker receives the task and begins processing

## Implementation Details

### Jules Bridge Service (`src/services/jules-bridge.ts`)

#### Main Method: `handleSlashCommand`

```typescript
async handleSlashCommand(
  owner: string,
  repo: string,
  prNumber: number,
  userInstruction: string
): Promise<void>
```

**Flow:**
1. Fetch PR Context → `fetchPRContext()`
2. Fetch Review Comments → `fetchReviewComments()`
3. Synthesize with AI → `synthesizePrompt()`
4. Dispatch to Jules → `dispatchToJules()`

#### AI Synthesis

Uses `@cf/meta/llama-3.1-70b-instruct` to convert scattered code review comments into a cohesive instruction set.

**System Prompt:**
```
You are a Technical Project Manager. Summarize the following GitHub Pull Request 
Code Comments into a single, step-by-step instruction list for an AI Coding Agent 
(Jules). Group related comments. Ignore simple praise (e.g., 'Nice code'). 
Output markdown.
```

**Fallback:** If AI synthesis fails, uses manual formatting as fallback.

#### Jules Dispatch Payload

```typescript
{
  type: "NEW_PROJECT",
  prompt: "<AI-generated instructions>",
  sourceContext: {
    repoUrl: "https://github.com/owner/repo/pull/42",
    branch: "feature-branch",
    prNumber: 42,
    owner: "owner",
    repo: "repo"
  }
}
```

### Webhook Handler (`src/routes/webhook-handler.ts`)

Processes GitHub webhook events:

1. **Event Filtering**: Only processes `issue_comment.created` events on PRs
2. **Command Detection**: Uses regex `/^\/colby\s+ask\s+jules\s+(.+)/i`
3. **Async Processing**: Uses `executionCtx.waitUntil()` for non-blocking execution
4. **Error Handling**: Comprehensive logging and error recovery

## Error Handling

### Webhook Handler
- Invalid webhook payloads → 400 Bad Request
- Missing PR information → Logs error and returns 400
- Jules processing failure → Logged, but webhook returns 202 Accepted

### Jules Bridge Service
- PR/comment fetch failure → Throws error with context
- AI synthesis failure → Falls back to manual formatting
- Jules Worker failure → Throws error with HTTP status

## Security Considerations

1. **Webhook Verification**: Currently not implemented. TODO: Add GitHub signature verification
2. **Service Binding**: Uses internal worker-to-worker communication (secure by default)
3. **API Key**: Octokit uses `GITHUB_TOKEN` from environment

## Testing

### Manual Testing

1. **Setup Webhook**:
   ```bash
   # In your GitHub repo settings
   Webhooks → Add webhook
   Payload URL: https://your-worker.workers.dev/webhook
   Content type: application/json
   Events: Issue comments
   ```

2. **Test Command**:
   - Open a PR
   - Add comment: `/colby ask jules test the integration`
   - Check worker logs for processing

### Validation Script

```bash
cd /home/runner/work/core-github-api/core-github-api
node /tmp/test-jules-bridge.js
```

## Logging

All operations are logged with the `[JulesBridge]` or `[Webhook]` prefix:

```
[Webhook] Received event: issue_comment
[Webhook] Jules command detected with instruction: fix all comments
[JulesBridge] Handling slash command for PR #42 in owner/repo
[JulesBridge] Fetched PR context: Feature: Add new component
[JulesBridge] Fetched 5 review comments
[JulesBridge] Synthesized prompt length: 1234 characters
[JulesBridge] Successfully dispatched to Jules Worker
```

## Future Enhancements

1. **Webhook Signature Verification**: Add GitHub webhook signature validation
2. **Status Updates**: Post progress updates back to GitHub as Jules works
3. **Result Reporting**: Comment with summary when Jules completes
4. **Command Variants**: Support additional commands like `/colby ask jules review` or `/colby ask jules test`
5. **Filtering**: Allow filtering which comments to include (e.g., only unresolved)
6. **Custom Models**: Allow specifying different AI models for synthesis

## Troubleshooting

### Command Not Working

1. **Check webhook delivery**: GitHub → Repo Settings → Webhooks → Recent Deliveries
2. **Check worker logs**: `wrangler tail` in production
3. **Verify bindings**: Ensure `JULES_WORKER` and `AI` are configured

### AI Synthesis Issues

- Check Worker AI quotas and limits
- Review logs for AI errors
- Fallback should activate automatically if AI fails

### Jules Not Responding

- Verify `jules-mcp` worker is deployed
- Check Service Binding configuration
- Review jules-mcp worker logs

## Related Files

- `src/services/jules-bridge.ts` - Core bridge service implementation
- `src/routes/webhook-handler.ts` - GitHub webhook endpoint
- `src/utils/hono.ts` - Type definitions for bindings
- `wrangler.jsonc` - Worker configuration with bindings
- `AGENTS.md` - Overall agent architecture documentation
