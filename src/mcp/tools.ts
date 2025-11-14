/**
 * @file src/mcp/tools.ts
 * @description Model Context Protocol (MCP) tools listing and execution
 * @owner AI-Builder
 */

import { z } from "zod";
import * as S from "../schemas/apiSchemas";

/**
 * MCP Tool Definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  examples?: Array<{
    input: Record<string, any>;
    output: Record<string, any>;
  }>;
  category: string;
  tags?: string[];
}

/**
 * Registry of all available MCP tools
 */
export const MCP_TOOLS: MCPTool[] = [
  {
    name: "searchRepositories",
    description: "Search for GitHub repositories using advanced query syntax",
    category: "GitHub Search",
    tags: ["github", "search", "repositories"],
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Search query (supports GitHub search syntax)",
        },
        sort: {
          type: "string",
          enum: ["stars", "forks", "help-wanted-issues", "updated"],
          description: "Sort field",
        },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order",
        },
        per_page: {
          type: "number",
          description: "Results per page (1-100)",
          minimum: 1,
          maximum: 100,
          default: 30,
        },
        page: {
          type: "number",
          description: "Page number",
          minimum: 1,
          default: 1,
        },
      },
      required: ["q"],
    },
    examples: [
      {
        input: {
          q: "language:typescript stars:>100",
          sort: "stars",
          order: "desc",
          per_page: 10,
        },
        output: {
          success: true,
          total_count: 1234,
          items: [],
        },
      },
    ],
  },
  {
    name: "upsertFile",
    description: "Create or update a file in a GitHub repository",
    category: "GitHub Files",
    tags: ["github", "files", "write"],
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
        path: {
          type: "string",
          description: "File path in the repository",
        },
        content: {
          type: "string",
          description: "File content (will be base64 encoded)",
        },
        message: {
          type: "string",
          description: "Commit message",
        },
        branch: {
          type: "string",
          description: "Branch name (optional)",
        },
        sha: {
          type: "string",
          description: "SHA of existing file (required for updates)",
        },
      },
      required: ["owner", "repo", "path", "content", "message"],
    },
    examples: [
      {
        input: {
          owner: "octocat",
          repo: "hello-world",
          path: "README.md",
          content: "# Hello World\n\nThis is a test.",
          message: "Update README",
        },
        output: {
          success: true,
          content: {
            name: "README.md",
            path: "README.md",
            sha: "abc123",
          },
        },
      },
    ],
  },
  {
    name: "createIssue",
    description: "Create a new issue in a GitHub repository",
    category: "GitHub Issues",
    tags: ["github", "issues", "create"],
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
        title: {
          type: "string",
          description: "Issue title",
        },
        body: {
          type: "string",
          description: "Issue body",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Issue labels",
        },
        assignees: {
          type: "array",
          items: { type: "string" },
          description: "Usernames to assign",
        },
      },
      required: ["owner", "repo", "title"],
    },
    examples: [
      {
        input: {
          owner: "octocat",
          repo: "hello-world",
          title: "Bug: Application crashes",
          body: "The application crashes when...",
          labels: ["bug"],
        },
        output: {
          success: true,
          issue: {
            number: 42,
            title: "Bug: Application crashes",
            state: "open",
          },
        },
      },
    ],
  },
  {
    name: "createPullRequest",
    description: "Create a new pull request in a GitHub repository",
    category: "GitHub Pull Requests",
    tags: ["github", "pull-requests", "create"],
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
        title: {
          type: "string",
          description: "Pull request title",
        },
        body: {
          type: "string",
          description: "Pull request body",
        },
        head: {
          type: "string",
          description: "Branch with changes",
        },
        base: {
          type: "string",
          description: "Branch to merge into",
        },
        draft: {
          type: "boolean",
          description: "Create as draft PR",
        },
      },
      required: ["owner", "repo", "title", "head", "base"],
    },
    examples: [
      {
        input: {
          owner: "octocat",
          repo: "hello-world",
          title: "feat: Add new feature",
          head: "feature-branch",
          base: "main",
        },
        output: {
          success: true,
          pull_request: {
            number: 42,
            title: "feat: Add new feature",
            state: "open",
          },
        },
      },
    ],
  },
  {
    name: "createSession",
    description: "Create a new agent session for GitHub search and analysis",
    category: "Agent Orchestration",
    tags: ["agents", "sessions", "orchestration"],
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Project identifier",
        },
        searchTerms: {
          type: "array",
          items: { type: "string" },
          description: "Search terms to process",
        },
        options: {
          type: "object",
          description: "Additional options",
        },
      },
      required: ["projectId", "searchTerms"],
    },
    examples: [
      {
        input: {
          projectId: "my-project",
          searchTerms: ["cloudflare workers", "durable objects"],
          options: {
            maxResults: 100,
          },
        },
        output: {
          success: true,
          session: {
            id: "550e8400-e29b-41d4-a716-446655440000",
            status: "active",
          },
        },
      },
    ],
  },
  {
    name: "getSessionStatus",
    description: "Get the status of an agent session",
    category: "Agent Orchestration",
    tags: ["agents", "sessions", "status"],
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "Session ID (UUID)",
        },
      },
      required: ["sessionId"],
    },
    examples: [
      {
        input: {
          sessionId: "550e8400-e29b-41d4-a716-446655440000",
        },
        output: {
          success: true,
          session: {
            id: "550e8400-e29b-41d4-a716-446655440000",
            status: "completed",
          },
        },
      },
    ],
  },
  {
    name: "listRepoTree",
    description: "List repository contents with a tree-style representation",
    category: "GitHub Files",
    tags: ["github", "files", "tree"],
    inputSchema: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "Repository owner",
        },
        repo: {
          type: "string",
          description: "Repository name",
        },
        path: {
          type: "string",
          description: "Path in repository (optional)",
        },
        branch: {
          type: "string",
          description: "Branch name (optional)",
        },
      },
      required: ["owner", "repo"],
    },
  },
];

/**
 * Get all MCP tools grouped by category
 */
export function getToolsByCategory(): Record<string, MCPTool[]> {
  const grouped: Record<string, MCPTool[]> = {};

  for (const tool of MCP_TOOLS) {
    if (!grouped[tool.category]) {
      grouped[tool.category] = [];
    }
    grouped[tool.category].push(tool);
  }

  return grouped;
}

/**
 * Get a specific tool by name
 */
export function getTool(name: string): MCPTool | undefined {
  return MCP_TOOLS.find(tool => tool.name === name);
}

/**
 * Search tools by tag
 */
export function searchToolsByTag(tag: string): MCPTool[] {
  return MCP_TOOLS.filter(tool => tool.tags?.includes(tag));
}

/**
 * Get tool statistics
 */
export function getToolStats() {
  const categories = new Set<string>();
  const tags = new Set<string>();

  for (const tool of MCP_TOOLS) {
    categories.add(tool.category);
    if (tool.tags) {
      for (const tag of tool.tags) {
        tags.add(tag);
      }
    }
  }

  return {
    totalTools: MCP_TOOLS.length,
    categories: Array.from(categories),
    categoryCount: categories.size,
    tags: Array.from(tags),
    tagCount: tags.size,
  };
}

/**
 * Execute request and response body schemas
 */
export const MCPExecuteRequest = z.object({
  tool: z.string().min(1).describe("Tool name to execute"),
  params: z.record(z.any()).describe("Tool parameters"),
}).openapi({
  example: {
    tool: "searchRepositories",
    params: {
      q: "language:typescript",
      per_page: 10,
    },
  },
});

export const MCPExecuteResponse = z.object({
  success: z.literal(true),
  tool: z.string(),
  result: z.any(),
  executedAt: z.string(),
  durationMs: z.number().optional(),
}).openapi({
  example: {
    success: true,
    tool: "searchRepositories",
    result: {
      total_count: 100,
      items: [],
    },
    executedAt: "2024-01-01T00:00:00Z",
    durationMs: 123,
  },
});

export const MCPToolsListResponse = z.object({
  success: z.literal(true),
  tools: z.array(z.any()),
  stats: z.object({
    totalTools: z.number().int(),
    categories: z.array(z.string()),
    categoryCount: z.number().int(),
  }),
}).openapi({
  example: {
    success: true,
    tools: [],
    stats: {
      totalTools: 7,
      categories: ["GitHub Search", "GitHub Files", "GitHub Issues"],
      categoryCount: 3,
    },
  },
});

export type TMCPExecuteRequest = z.infer<typeof MCPExecuteRequest>;
export type TMCPExecuteResponse = z.infer<typeof MCPExecuteResponse>;
export type TMCPToolsListResponse = z.infer<typeof MCPToolsListResponse>;
