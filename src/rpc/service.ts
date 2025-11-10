/**
 * @file src/rpc/service.ts
 * @description RPC Service class that exposes all GitHub Worker capabilities via RPC
 * @owner AI-Builder
 *
 * This class can be used as a service binding in other Cloudflare Workers.
 *
 * Example usage in another worker's wrangler.jsonc:
 * {
 *   "services": [
 *     {
 *       "binding": "GITHUB_WORKER",
 *       "service": "github-worker"
 *     }
 *   ]
 * }
 *
 * Then in the other worker:
 * const result = await env.GITHUB_WORKER.upsertFile({ owner: '...', repo: '...', ... })
 */

import { getOctokit } from '../octokit/core'
import { encode } from '../utils/base64'
import type {
  UpsertFileRequest,
  UpsertFileResponse,
  ListRepoTreeRequest,
  ListRepoTreeResponse,
  OpenPullRequestRequest,
  OpenPullRequestResponse,
  CreateIssueRequest,
  CreateIssueResponse,
  OctokitRestRequest,
  OctokitRestResponse,
  OctokitGraphQLRequest,
  OctokitGraphQLResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionStatusRequest,
  GetSessionStatusResponse,
  SearchRepositoriesRequest,
  SearchRepositoriesResponse,
  HealthCheckResponse,
} from './types'

export class GitHubWorkerRPC {
  private env: Env

  constructor(env: Env) {
    this.env = env
  }

  // ==================== Health Check ====================

  /**
   * Check the health status of the worker
   */
  async health(): Promise<HealthCheckResponse> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    }
  }

  // ==================== File Operations ====================

  /**
   * Create or update a file in a GitHub repository
   */
  async upsertFile(request: UpsertFileRequest): Promise<UpsertFileResponse> {
    const octokit = getOctokit(this.env)
    const { owner, repo, path, content, message, sha } = request

    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: encode(content),
      sha,
    })

    return {
      content: {
        name: data.content!.name,
        path: data.content!.path,
        sha: data.content!.sha,
        size: data.content!.size,
        url: data.content!.url,
        html_url: data.content!.html_url,
        git_url: data.content!.git_url,
        download_url: data.content!.download_url,
        type: data.content!.type,
      },
      commit: {
        sha: data.commit.sha!,
        url: data.commit.url,
        html_url: data.commit.html_url,
        message: data.commit.message,
      },
    }
  }

  /**
   * List repository contents with a tree-style representation
   */
  async listRepoTree(request: ListRepoTreeRequest): Promise<ListRepoTreeResponse> {
    const octokit = getOctokit(this.env)
    const { owner, repo, ref, path, recursive } = request

    const treeSha = ref ?? 'HEAD'
    const recursiveFlag = recursive ?? true

    const { data } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: recursiveFlag ? '1' : undefined,
    })

    const normalizedPath = path?.replace(/^\/+|\/+$/g, '')

    const filteredTree = normalizedPath
      ? data.tree.filter((entry) => {
          if (!entry.path) return false
          return entry.path === normalizedPath || entry.path.startsWith(`${normalizedPath}/`)
        })
      : data.tree

    const sortedEntries = [...filteredTree].sort((a, b) => {
      const pathA = a.path ?? ''
      const pathB = b.path ?? ''
      return pathA.localeCompare(pathB)
    })

    const formattedEntries = sortedEntries.map((entry) => {
      const pathValue = entry.path ?? ''
      const segments = (() => {
        if (!pathValue) return [] as string[]
        if (!normalizedPath) return pathValue.split('/').filter(Boolean)
        if (pathValue === normalizedPath) return [] as string[]
        if (pathValue.startsWith(`${normalizedPath}/`)) {
          return pathValue.slice(normalizedPath.length + 1).split('/').filter(Boolean)
        }
        return pathValue.split('/').filter(Boolean)
      })()

      const relativeDepth = normalizedPath ? segments.length : Math.max(0, segments.length - 1)
      const indent = '  '.repeat(relativeDepth)
      const suffix = entry.type === 'tree' ? '/' : ''

      const displayPath = normalizedPath && pathValue === normalizedPath
        ? './'
        : segments.length === 0
          ? (pathValue || './') + suffix
          : `${indent}${segments[segments.length - 1]}${suffix}`

      return {
        path: pathValue,
        type: entry.type ?? 'blob',
        mode: entry.mode ?? '',
        sha: entry.sha ?? '',
        size: typeof entry.size === 'number' ? entry.size : null,
        url: entry.url ?? null,
        depth: relativeDepth,
        displayPath,
      }
    })

    const header = 'MODE     TYPE   SIZE      SHA                                      PATH'
    const listingLines = formattedEntries.map((entry) => {
      const sizeValue = entry.size === null ? '-' : entry.size.toString()
      return `${entry.mode.padEnd(8)} ${entry.type.padEnd(5)} ${sizeValue.padStart(8)} ${entry.sha} ${entry.displayPath}`
    })

    const listing = [header, ...listingLines].join('\n')

    return {
      entries: formattedEntries,
      listing,
      truncated: data.truncated ?? false,
    }
  }

  // ==================== Pull Request Operations ====================

  /**
   * Open a new pull request
   */
  async openPullRequest(request: OpenPullRequestRequest): Promise<OpenPullRequestResponse> {
    const octokit = getOctokit(this.env)
    const { owner, repo, head, base, title, body } = request

    const { data } = await octokit.pulls.create({
      owner,
      repo,
      head,
      base,
      title,
      body,
    })

    return {
      number: data.number,
      html_url: data.html_url,
      state: data.state,
      title: data.title,
      user: {
        login: data.user!.login,
        avatar_url: data.user!.avatar_url,
      },
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
  }

  // ==================== Issue Operations ====================

  /**
   * Create a new issue
   */
  async createIssue(request: CreateIssueRequest): Promise<CreateIssueResponse> {
    const octokit = getOctokit(this.env)
    const { owner, repo, title, body, labels } = request

    const { data } = await octokit.issues.create({
      owner,
      repo,
      title,
      body,
      labels,
    })

    return {
      number: data.number,
      html_url: data.html_url,
      state: data.state,
      title: data.title,
      body: data.body,
      user: {
        login: data.user!.login,
        avatar_url: data.user!.avatar_url,
      },
      labels: data.labels.map((label) => ({
        name: typeof label === 'string' ? label : label.name!,
        color: typeof label === 'string' ? '' : label.color!,
      })),
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
  }

  // ==================== Octokit REST Operations ====================

  /**
   * Generic proxy for GitHub REST API calls
   * Example: octokitRest({ namespace: 'repos', method: 'get', params: { owner: 'octocat', repo: 'hello-world' } })
   */
  async octokitRest(request: OctokitRestRequest): Promise<OctokitRestResponse> {
    const octokit = getOctokit(this.env)
    const { namespace, method, params = {} } = request

    // @ts-ignore - Dynamic method invocation
    if (!octokit[namespace] || !octokit[namespace][method]) {
      throw new Error(`Method not found: ${namespace}.${method}`)
    }

    // @ts-ignore - Dynamic method invocation
    const { data, headers, status } = await octokit[namespace][method](params)

    return {
      data,
      status,
      headers: headers as Record<string, string>,
    }
  }

  // ==================== Octokit GraphQL Operations ====================

  /**
   * Execute a GraphQL query against the GitHub API
   */
  async octokitGraphQL(request: OctokitGraphQLRequest): Promise<OctokitGraphQLResponse> {
    const octokit = getOctokit(this.env)
    const { query, variables = {} } = request

    try {
      const data = await octokit.graphql(query, variables)
      return { data }
    } catch (error: any) {
      if (error.errors) {
        return {
          data: error.data || null,
          errors: error.errors,
        }
      }
      throw error
    }
  }

  // ==================== Agent Session Operations ====================

  /**
   * Create a new agent session for GitHub search and analysis
   */
  async createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
    const { prompt } = request
    const orchestrator = this.env.ORCHESTRATOR.get(
      this.env.ORCHESTRATOR.idFromName('orchestrator')
    )
    const { sessionId } = await orchestrator.start(prompt)
    return { sessionId }
  }

  /**
   * Get the status of an agent session
   */
  async getSessionStatus(request: GetSessionStatusRequest): Promise<GetSessionStatusResponse> {
    const { sessionId } = request
    const orchestrator = this.env.ORCHESTRATOR.get(
      this.env.ORCHESTRATOR.idFromName('orchestrator')
    )
    const status = await orchestrator.getStatus(sessionId)
    return status
  }

  // ==================== Search Operations ====================

  /**
   * Search for GitHub repositories
   */
  async searchRepositories(request: SearchRepositoriesRequest): Promise<SearchRepositoriesResponse> {
    const octokit = getOctokit(this.env)
    const { query, sort, order, per_page = 30, page = 1 } = request

    const { data } = await octokit.search.repos({
      q: query,
      sort,
      order,
      per_page,
      page,
    })

    return {
      total_count: data.total_count,
      incomplete_results: data.incomplete_results,
      items: data.items.map((item) => ({
        id: item.id,
        name: item.name,
        full_name: item.full_name,
        owner: {
          login: item.owner.login,
          avatar_url: item.owner.avatar_url,
        },
        html_url: item.html_url,
        description: item.description,
        fork: item.fork,
        created_at: item.created_at,
        updated_at: item.updated_at,
        pushed_at: item.pushed_at,
        stargazers_count: item.stargazers_count,
        watchers_count: item.watchers_count,
        forks_count: item.forks_count,
        language: item.language,
      })),
    }
  }

  // ==================== Batch Operations ====================

  /**
   * Batch upsert multiple files in a single call
   * Useful for updating multiple files at once
   */
  async batchUpsertFiles(requests: UpsertFileRequest[]): Promise<UpsertFileResponse[]> {
    const results: UpsertFileResponse[] = []

    for (const request of requests) {
      const result = await this.upsertFile(request)
      results.push(result)
    }

    return results
  }

  /**
   * Batch create multiple issues in a single call
   */
  async batchCreateIssues(requests: CreateIssueRequest[]): Promise<CreateIssueResponse[]> {
    const results: CreateIssueResponse[] = []

    for (const request of requests) {
      const result = await this.createIssue(request)
      results.push(result)
    }

    return results
  }
}
