/**
 * @file src/rpc/types.ts
 * @description Type definitions for RPC methods exposed by the GitHub Worker
 * @owner AI-Builder
 */

// ==================== File Operations ====================

export interface UpsertFileRequest {
  owner: string
  repo: string
  path: string
  content: string
  message: string
  sha?: string
}

export interface UpsertFileResponse {
  content: {
    name: string
    path: string
    sha: string
    size: number
    url: string
    html_url: string
    git_url: string
    download_url: string | null
    type: string
  }
  commit: {
    sha: string
    url: string
    html_url: string
    message: string
  }
}

export interface ListRepoTreeRequest {
  owner: string
  repo: string
  ref?: string
  path?: string
  recursive?: boolean
}

export interface TreeEntry {
  path: string
  type: string
  mode: string
  sha: string
  size: number | null
  url: string | null
  depth: number
  displayPath: string
}

export interface ListRepoTreeResponse {
  entries: TreeEntry[]
  listing: string
  truncated: boolean
}

// ==================== Pull Request Operations ====================

export interface OpenPullRequestRequest {
  owner: string
  repo: string
  head: string
  base: string
  title: string
  body?: string
}

export interface OpenPullRequestResponse {
  number: number
  html_url: string
  state: string
  title: string
  user: {
    login: string
    avatar_url: string
  }
  created_at: string
  updated_at: string
}

// ==================== Issue Operations ====================

export interface CreateIssueRequest {
  owner: string
  repo: string
  title: string
  body?: string
  labels?: string[]
}

export interface CreateIssueResponse {
  number: number
  html_url: string
  state: string
  title: string
  body: string | null
  user: {
    login: string
    avatar_url: string
  }
  labels: Array<{
    name: string
    color: string
  }>
  created_at: string
  updated_at: string
}

// ==================== Octokit REST Operations ====================

export interface OctokitRestRequest {
  namespace: string
  method: string
  params?: Record<string, any>
}

export interface OctokitRestResponse {
  data: any
  status: number
  headers: Record<string, string>
}

// ==================== Octokit GraphQL Operations ====================

export interface OctokitGraphQLRequest {
  query: string
  variables?: Record<string, any>
}

export interface OctokitGraphQLResponse {
  data: any
  errors?: Array<{
    message: string
    locations?: Array<{
      line: number
      column: number
    }>
  }>
}

// ==================== Agent Session Operations ====================

export interface CreateSessionRequest {
  prompt: string
}

export interface CreateSessionResponse {
  sessionId: string
}

export interface GetSessionStatusRequest {
  sessionId: string
}

export interface GetSessionStatusResponse {
  sessionId: string
  status: 'pending' | 'completed'
  results?: Array<{
    repo_full_name: string
    repo_url: string
    description: string | null
    relevancy_score: number
  }>
}

// ==================== Search Operations ====================

export interface SearchRepositoriesRequest {
  query: string
  sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated'
  order?: 'asc' | 'desc'
  per_page?: number
  page?: number
}

export interface SearchRepositoriesResponse {
  total_count: number
  incomplete_results: boolean
  items: Array<{
    id: number
    name: string
    full_name: string
    owner: {
      login: string
      avatar_url: string
    }
    html_url: string
    description: string | null
    fork: boolean
    created_at: string
    updated_at: string
    pushed_at: string
    stargazers_count: number
    watchers_count: number
    forks_count: number
    language: string | null
  }>
}

// ==================== Health Check ====================

export interface HealthCheckResponse {
  status: 'ok'
  timestamp: string
  version: string
}
