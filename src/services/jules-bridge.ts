/**
 * @file src/services/jules-bridge.ts
 * @description Jules Bridge Service for handling /colby ask jules slash commands
 * @owner AI-Builder
 */

import type { Octokit } from '@octokit/rest'
import type { Ai } from '@cloudflare/workers-types'

export interface JulesBridgeConfig {
  octokit: Octokit
  env: {
    AI: Ai
    JULES_WORKER: Fetcher
  }
}

export interface ReviewComment {
  path: string
  line: number | null
  body: string
  user: string
}

export interface PullRequestContext {
  title: string
  branchName: string
  repoUrl: string
  number: number
  owner: string
  repo: string
}

export class JulesBridgeService {
  private octokit: Octokit
  private env: JulesBridgeConfig['env']

  constructor(config: JulesBridgeConfig) {
    this.octokit = config.octokit
    this.env = config.env
  }

  /**
   * Handle a slash command from a GitHub PR comment
   * @param owner Repository owner
   * @param repo Repository name
   * @param prNumber Pull request number
   * @param userInstruction User instruction from the slash command
   */
  async handleSlashCommand(
    owner: string,
    repo: string,
    prNumber: number,
    userInstruction: string
  ): Promise<void> {
    console.log(`[JulesBridge] Handling slash command for PR #${prNumber} in ${owner}/${repo}`)
    console.log(`[JulesBridge] User instruction: ${userInstruction}`)

    try {
      // Step 1: Fetch PR Context
      const prContext = await this.fetchPRContext(owner, repo, prNumber)
      console.log(`[JulesBridge] Fetched PR context: ${prContext.title}`)

      // Step 2: Fetch Review Comments
      const comments = await this.fetchReviewComments(owner, repo, prNumber)
      console.log(`[JulesBridge] Fetched ${comments.length} review comments`)

      // Step 3: Synthesize Prompt with Worker AI
      const synthesizedPrompt = await this.synthesizePrompt(prContext, comments, userInstruction)
      console.log(`[JulesBridge] Synthesized prompt length: ${synthesizedPrompt.length} characters`)

      // Step 4: Dispatch to Jules Worker
      await this.dispatchToJules(prContext, synthesizedPrompt)
      console.log(`[JulesBridge] Successfully dispatched to Jules Worker`)
    } catch (error: any) {
      console.error('[JulesBridge] Error handling slash command:', error)
      throw new Error(`Jules Bridge failed: ${error.message || 'Unknown error'}`)
    }
  }

  /**
   * Fetch PR context including title, branch, and repo URL
   */
  private async fetchPRContext(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PullRequestContext> {
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    })

    return {
      title: pr.title,
      branchName: pr.head.ref,
      repoUrl: pr.html_url,
      number: prNumber,
      owner,
      repo,
    }
  }

  /**
   * Fetch all review comments on the PR
   */
  private async fetchReviewComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewComment[]> {
    const { data: comments } = await this.octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
    })

    return comments.map((comment) => ({
      path: comment.path,
      line: comment.line || comment.original_line || null,
      body: comment.body,
      user: comment.user?.login || 'unknown',
    }))
  }

  /**
   * Synthesize a cohesive prompt from scattered comments using Worker AI
   */
  private async synthesizePrompt(
    prContext: PullRequestContext,
    comments: ReviewComment[],
    userInstruction: string
  ): Promise<string> {
    // Format comments for AI processing
    const formattedComments = comments
      .map((comment) => {
        const location = comment.line
          ? `[File: ${comment.path}:${comment.line}]`
          : `[File: ${comment.path}]`
        return `${location} ${comment.user} said: "${comment.body}"`
      })
      .join('\n')

    const systemPrompt = `You are a Technical Project Manager. Summarize the following GitHub Pull Request Code Comments into a single, step-by-step instruction list for an AI Coding Agent (Jules). Group related comments. Ignore simple praise (e.g., 'Nice code'). Output markdown.`

    const userPrompt = `PR Context:
- Repository: ${prContext.owner}/${prContext.repo}
- PR #${prContext.number}: ${prContext.title}
- Branch: ${prContext.branchName}
- URL: ${prContext.repoUrl}

User Instruction: ${userInstruction}

Code Review Comments:
${formattedComments || 'No code review comments found.'}

Please synthesize these into a clear, actionable instruction set for an AI coding agent.`

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-70b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      })

      // Extract the response text
      const aiResponse = (response as any)?.response || JSON.stringify(response)
      console.log(`[JulesBridge] AI Response received: ${aiResponse.substring(0, 200)}...`)

      return aiResponse
    } catch (error: any) {
      console.error('[JulesBridge] AI synthesis failed:', error)
      // Fallback to manual formatting if AI fails
      return this.fallbackSynthesis(prContext, comments, userInstruction)
    }
  }

  /**
   * Fallback synthesis if AI is unavailable
   */
  private fallbackSynthesis(
    prContext: PullRequestContext,
    comments: ReviewComment[],
    userInstruction: string
  ): string {
    let prompt = `Context: PR #${prContext.number} on repo '${prContext.owner}/${prContext.repo}'.\n`
    prompt += `Branch: '${prContext.branchName}'.\n`
    prompt += `User Instruction: '${userInstruction}'.\n\n`
    prompt += `Required Changes based on Code Reviews:\n`

    if (comments.length === 0) {
      prompt += `No specific code review comments found.\n`
    } else {
      comments.forEach((comment, index) => {
        const location = comment.line ? `${comment.path}:${comment.line}` : comment.path
        prompt += `${index + 1}. In \`${location}\`: ${comment.body}\n`
      })
    }

    return prompt
  }

  /**
   * Dispatch the task to Jules Manager Worker via Service Binding
   */
  private async dispatchToJules(
    prContext: PullRequestContext,
    synthesizedPrompt: string
  ): Promise<void> {
    const payload = {
      type: 'NEW_PROJECT',
      prompt: synthesizedPrompt,
      sourceContext: {
        repoUrl: prContext.repoUrl,
        branch: prContext.branchName,
        prNumber: prContext.number,
        owner: prContext.owner,
        repo: prContext.repo,
      },
    }

    console.log(`[JulesBridge] Dispatching to Jules Worker:`, JSON.stringify(payload, null, 2))

    const response = await this.env.JULES_WORKER.fetch('http://internal/task', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Jules Worker responded with ${response.status}: ${errorText}`)
    }

    const result = await response.json()
    console.log(`[JulesBridge] Jules Worker response:`, result)
  }
}
