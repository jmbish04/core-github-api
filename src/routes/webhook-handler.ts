/**
 * @file src/routes/webhook-handler.ts
 * @description GitHub webhook handler
 * @owner AI-Builder
 */

import type { Context } from 'hono'
import type { Bindings } from '../utils/hono'
import { getOctokit } from '../octokit/core'
import { JulesBridgeService } from '../services/jules-bridge'

export async function webhookHandler(c: Context<{ Bindings: Bindings }>): Promise<Response> {
  try {
    // Parse the webhook payload
    const payload = await c.req.json()
    const event = c.req.header('x-github-event')

    console.log(`[Webhook] Received event: ${event}`)

    // Handle issue_comment.created events
    if (event === 'issue_comment' && payload.action === 'created') {
      // Check if this is a PR comment (not a standard issue comment)
      if (!payload.issue?.pull_request) {
        console.log('[Webhook] Comment is on an issue, not a PR. Ignoring.')
        return c.json({ message: 'Not a PR comment' }, 200)
      }

      const commentBody = payload.comment?.body || ''
      const slashCommandRegex = /^\/colby\s+ask\s+jules\s+(.+)/i

      // Check if the comment starts with /colby ask jules
      const match = commentBody.match(slashCommandRegex)
      if (!match) {
        console.log('[Webhook] Comment does not contain /colby ask jules command. Ignoring.')
        return c.json({ message: 'Not a Jules command' }, 200)
      }

      // Extract the user instruction after the command
      const userInstruction = match[1].trim()
      console.log(`[Webhook] Jules command detected with instruction: ${userInstruction}`)

      // Extract PR and repo information
      const owner = payload.repository?.owner?.login
      const repo = payload.repository?.name
      const prNumber = payload.issue?.number

      if (!owner || !repo || !prNumber) {
        console.error('[Webhook] Missing required information from webhook payload')
        return c.json({ error: 'Invalid webhook payload' }, 400)
      }

      // Initialize Octokit and Jules Bridge Service
      const octokit = getOctokit(c.env)
      const julesBridge = new JulesBridgeService({
        octokit,
        env: {
          AI: c.env.AI,
          JULES_WORKER: c.env.JULES_WORKER,
        },
      })

      // Post a confirmation comment to GitHub
      try {
        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: '🤖 On it! Sending task to Jules...',
        })
      } catch (error) {
        console.error('[Webhook] Failed to post confirmation comment:', error)
        // Continue even if comment posting fails
      }

      // Process the slash command (fire and forget)
      c.executionCtx.waitUntil(
        julesBridge
          .handleSlashCommand(owner, repo, prNumber, userInstruction)
          .then(() => {
            console.log('[Webhook] Jules command processed successfully')
          })
          .catch((error) => {
            console.error('[Webhook] Failed to process Jules command:', error)
          })
      )

      return c.json({ message: 'Jules command accepted' }, 202)
    }

    // For other webhook events, return success
    return c.json({ message: 'Webhook received' }, 200)
  } catch (error: any) {
    console.error('[Webhook] Error processing webhook:', error)
    return c.json({ error: 'Internal server error', details: error.message }, 500)
  }
}
