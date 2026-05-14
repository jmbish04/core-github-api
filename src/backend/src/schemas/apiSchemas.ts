/**
 * @file src/schemas/apiSchemas.ts
 * @description Zod schemas for API validation and OpenAPI documentation
 * @owner AI-Builder
 */

import { DEFAULT_GITHUB_OWNER } from "@github-utils";
import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

export const ErrorResponse = z.object({
  success: z.literal(false),
  error: z.string().describe("Error message"),
  details: z.any().optional().describe("Additional error details"),
  code: z.string().optional().describe("Error code for programmatic handling"),
});

export const SuccessResponse = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

// ============================================================================
// GitHub Repository Schemas
// ============================================================================

export const Repository = z.object({
  id: z.number().int().describe("GitHub repository ID"),
  name: z.string().describe("Repository name"),
  full_name: z.string().describe("Full repository name (owner/repo)"),
  owner: z.object({
    login: z.string(),
    id: z.number().int(),
    avatar_url: z.string().url(),
    type: z.enum(["User", "Organization"]),
  }),
  html_url: z.string().url().describe("Repository URL"),
  description: z.string().nullable().describe("Repository description"),
  fork: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string(),
  stargazers_count: z.number().int(),
  watchers_count: z.number().int(),
  language: z.string().nullable(),
  forks_count: z.number().int(),
  open_issues_count: z.number().int(),
  default_branch: z.string(),
  visibility: z.enum(["public", "private", "internal"]).optional(),
});

export const SearchRepositoriesRequest = z.object({
  q: z.string().min(1).describe("Search query"),
  sort: z.enum(["stars", "forks", "help-wanted-issues", "updated"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  per_page: z.number().int().min(1).max(100).default(30),
  page: z.number().int().min(1).default(1),
});

export const SearchRepositoriesResponse = z.object({
  success: z.literal(true),
  total_count: z.number().int(),
  incomplete_results: z.boolean(),
  items: z.array(Repository),
});

// ============================================================================
// File Operations Schemas
// ============================================================================

export const FileContent = z.object({
  name: z.string(),
  path: z.string(),
  sha: z.string(),
  size: z.number().int(),
  url: z.string().url(),
  html_url: z.string().url(),
  git_url: z.string().url(),
  download_url: z.string().url().nullable(),
  type: z.enum(["file", "dir", "symlink", "submodule"]),
  content: z.string().optional().describe("Base64 encoded content"),
  encoding: z.string().optional(),
});

export const UpsertFileRequest = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER).describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  path: z.string().describe("File path"),
  content: z.string().describe("File content (will be base64 encoded)"),
  message: z.string().describe("Commit message"),
  branch: z.string().optional().describe("Branch name (defaults to repository default branch)"),
  sha: z.string().optional().describe("SHA of the file being replaced (required for updates)"),
});

export const UpsertFileResponse = z.object({
  success: z.literal(true),
  content: FileContent,
  commit: z.object({
    sha: z.string(),
    message: z.string(),
    author: z.object({
      name: z.string(),
      email: z.string(),
      date: z.string(),
    }),
  }),
});

// ============================================================================
// Issue Schemas
// ============================================================================

export const Issue = z.object({
  id: z.number().int(),
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(["open", "closed"]),
  html_url: z.string().url(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  user: z.object({
    login: z.string(),
    id: z.number().int(),
    avatar_url: z.string().url(),
  }),
  labels: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    color: z.string(),
    description: z.string().nullable(),
  })),
  assignees: z.array(z.object({
    login: z.string(),
    id: z.number().int(),
    avatar_url: z.string().url(),
  })),
});

export const CreateIssueRequest = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER).describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  title: z.string().min(1).describe("Issue title"),
  body: z.string().optional().describe("Issue body"),
  labels: z.array(z.string()).optional().describe("Issue labels"),
  assignees: z.array(z.string()).optional().describe("Usernames to assign"),
  milestone: z.number().int().optional().describe("Milestone number"),
});

export const CreateIssueResponse = z.object({
  success: z.literal(true),
  issue: Issue,
});

// ============================================================================
// Pull Request Schemas
// ============================================================================

export const PullRequest = z.object({
  id: z.number().int(),
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(["open", "closed"]),
  html_url: z.string().url(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  merged_at: z.string().nullable(),
  user: z.object({
    login: z.string(),
    id: z.number().int(),
    avatar_url: z.string().url(),
  }),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  base: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  draft: z.boolean(),
  mergeable: z.boolean().nullable(),
});

export const CreatePullRequestRequest = z.object({
  owner: z.string().default(DEFAULT_GITHUB_OWNER).describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  title: z.string().min(1).describe("Pull request title"),
  body: z.string().optional().describe("Pull request body"),
  head: z.string().describe("The name of the branch where your changes are implemented"),
  base: z.string().describe("The name of the branch you want the changes pulled into"),
  draft: z.boolean().optional().describe("Whether to create as a draft PR"),
});

export const CreatePullRequestResponse = z.object({
  success: z.literal(true),
  pull_request: PullRequest,
});

// ============================================================================
// Agent Session Schemas
// ============================================================================

export const AgentSession = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  status: z.enum(["active", "idle", "completed", "failed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const CreateSessionRequest = z.object({
  projectId: z.string().min(1).describe("Project identifier"),
  searchTerms: z.array(z.string()).min(1).describe("Search terms"),
  options: z.record(z.string(), z.any()).optional().describe("Additional options"),
});

export const CreateSessionResponse = z.object({
  success: z.literal(true),
  session: AgentSession,
});

export const GetSessionStatusResponse = z.object({
  success: z.literal(true),
  session: AgentSession,
  results: z.array(z.object({
    searchId: z.string(),
    searchTerm: z.string(),
    status: z.enum(["pending", "running", "completed", "failed"]),
    repositoriesFound: z.number().int(),
    repositoriesAnalyzed: z.number().int(),
  })).optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type TErrorResponse = z.infer<typeof ErrorResponse>;
export type TSuccessResponse = z.infer<typeof SuccessResponse>;
export type TRepository = z.infer<typeof Repository>;
export type TSearchRepositoriesRequest = z.infer<typeof SearchRepositoriesRequest>;
export type TSearchRepositoriesResponse = z.infer<typeof SearchRepositoriesResponse>;
export type TFileContent = z.infer<typeof FileContent>;
export type TUpsertFileRequest = z.infer<typeof UpsertFileRequest>;
export type TUpsertFileResponse = z.infer<typeof UpsertFileResponse>;
export type TIssue = z.infer<typeof Issue>;
export type TCreateIssueRequest = z.infer<typeof CreateIssueRequest>;
export type TCreateIssueResponse = z.infer<typeof CreateIssueResponse>;
export type TPullRequest = z.infer<typeof PullRequest>;
export type TCreatePullRequestRequest = z.infer<typeof CreatePullRequestRequest>;
export type TCreatePullRequestResponse = z.infer<typeof CreatePullRequestResponse>;
export type TAgentSession = z.infer<typeof AgentSession>;
export type TCreateSessionRequest = z.infer<typeof CreateSessionRequest>;
export type TCreateSessionResponse = z.infer<typeof CreateSessionResponse>;
export type TGetSessionStatusResponse = z.infer<typeof GetSessionStatusResponse>;
