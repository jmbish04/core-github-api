/**
 * @file src/schemas/apiSchemas.ts
 * @description Zod schemas for API validation and OpenAPI documentation
 * @owner AI-Builder
 */

import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

export const ErrorResponse = z.object({
  success: z.literal(false),
  error: z.string().describe("Error message"),
  details: z.any().optional().describe("Additional error details"),
  code: z.string().optional().describe("Error code for programmatic handling"),
}).openapi({
  example: {
    success: false,
    error: "Resource not found",
    code: "NOT_FOUND",
  },
});

export const SuccessResponse = z.object({
  success: z.literal(true),
  message: z.string().optional(),
}).openapi({
  example: {
    success: true,
    message: "Operation completed successfully",
  },
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
}).openapi({
  example: {
    id: 123456,
    name: "awesome-project",
    full_name: "octocat/awesome-project",
    owner: {
      login: "octocat",
      id: 1,
      avatar_url: "https://avatars.githubusercontent.com/u/1",
      type: "User",
    },
    html_url: "https://github.com/octocat/awesome-project",
    description: "An awesome project",
    fork: false,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-15T00:00:00Z",
    pushed_at: "2024-01-15T00:00:00Z",
    stargazers_count: 100,
    watchers_count: 50,
    language: "TypeScript",
    forks_count: 10,
    open_issues_count: 5,
    default_branch: "main",
    visibility: "public",
  },
});

export const SearchRepositoriesRequest = z.object({
  q: z.string().min(1).describe("Search query"),
  sort: z.enum(["stars", "forks", "help-wanted-issues", "updated"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  per_page: z.number().int().min(1).max(100).default(30),
  page: z.number().int().min(1).default(1),
}).openapi({
  example: {
    q: "language:typescript stars:>100",
    sort: "stars",
    order: "desc",
    per_page: 10,
    page: 1,
  },
});

export const SearchRepositoriesResponse = z.object({
  success: z.literal(true),
  total_count: z.number().int(),
  incomplete_results: z.boolean(),
  items: z.array(Repository),
}).openapi({
  example: {
    success: true,
    total_count: 1234,
    incomplete_results: false,
    items: [],
  },
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
}).openapi({
  example: {
    name: "README.md",
    path: "README.md",
    sha: "abc123",
    size: 1024,
    url: "https://api.github.com/repos/octocat/awesome-project/contents/README.md",
    html_url: "https://github.com/octocat/awesome-project/blob/main/README.md",
    git_url: "https://api.github.com/repos/octocat/awesome-project/git/blobs/abc123",
    download_url: "https://raw.githubusercontent.com/octocat/awesome-project/main/README.md",
    type: "file",
    content: "IyBBd2Vzb21lIFByb2plY3Q=",
    encoding: "base64",
  },
});

export const UpsertFileRequest = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  path: z.string().describe("File path"),
  content: z.string().describe("File content (will be base64 encoded)"),
  message: z.string().describe("Commit message"),
  branch: z.string().optional().describe("Branch name (defaults to repository default branch)"),
  sha: z.string().optional().describe("SHA of the file being replaced (required for updates)"),
}).openapi({
  example: {
    owner: "octocat",
    repo: "awesome-project",
    path: "src/index.ts",
    content: "console.log('Hello, World!');",
    message: "Add index.ts",
    branch: "main",
  },
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
}).openapi({
  example: {
    id: 1,
    number: 42,
    title: "Bug: Application crashes on startup",
    body: "When I start the application, it immediately crashes.",
    state: "open",
    html_url: "https://github.com/octocat/awesome-project/issues/42",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    closed_at: null,
    user: {
      login: "user123",
      id: 123,
      avatar_url: "https://avatars.githubusercontent.com/u/123",
    },
    labels: [],
    assignees: [],
  },
});

export const CreateIssueRequest = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  title: z.string().min(1).describe("Issue title"),
  body: z.string().optional().describe("Issue body"),
  labels: z.array(z.string()).optional().describe("Issue labels"),
  assignees: z.array(z.string()).optional().describe("Usernames to assign"),
  milestone: z.number().int().optional().describe("Milestone number"),
}).openapi({
  example: {
    owner: "octocat",
    repo: "awesome-project",
    title: "Feature request: Add dark mode",
    body: "It would be great to have a dark mode option.",
    labels: ["enhancement"],
    assignees: ["octocat"],
  },
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
}).openapi({
  example: {
    id: 1,
    number: 42,
    title: "feat: Add new feature",
    body: "This PR adds a new feature.",
    state: "open",
    html_url: "https://github.com/octocat/awesome-project/pull/42",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    closed_at: null,
    merged_at: null,
    user: {
      login: "user123",
      id: 123,
      avatar_url: "https://avatars.githubusercontent.com/u/123",
    },
    head: {
      ref: "feature-branch",
      sha: "abc123",
    },
    base: {
      ref: "main",
      sha: "def456",
    },
    draft: false,
    mergeable: true,
  },
});

export const CreatePullRequestRequest = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  title: z.string().min(1).describe("Pull request title"),
  body: z.string().optional().describe("Pull request body"),
  head: z.string().describe("The name of the branch where your changes are implemented"),
  base: z.string().describe("The name of the branch you want the changes pulled into"),
  draft: z.boolean().optional().describe("Whether to create as a draft PR"),
}).openapi({
  example: {
    owner: "octocat",
    repo: "awesome-project",
    title: "feat: Add new feature",
    body: "This PR adds a new feature that improves performance.",
    head: "feature-branch",
    base: "main",
    draft: false,
  },
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
  metadata: z.record(z.any()).optional(),
}).openapi({
  example: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    projectId: "my-project",
    status: "active",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    metadata: {
      searchTerm: "cloudflare workers",
      resultsCount: 42,
    },
  },
});

export const CreateSessionRequest = z.object({
  projectId: z.string().min(1).describe("Project identifier"),
  searchTerms: z.array(z.string()).min(1).describe("Search terms"),
  options: z.record(z.any()).optional().describe("Additional options"),
}).openapi({
  example: {
    projectId: "my-project",
    searchTerms: ["cloudflare workers", "durable objects"],
    options: {
      maxResults: 100,
      includeArchived: false,
    },
  },
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
