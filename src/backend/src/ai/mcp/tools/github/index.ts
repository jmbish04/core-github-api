/**
 * @file src/tools/index.ts
 * @description This file exports all the tool routes.
 * @owner AI-Builder
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import files from './files'
import prs from './prs'
import issues from './issues'
import github from './github'
import kv from './kv'
import comments from './comments'
import healthCheck from './health'


const toolsApi = new OpenAPIHono<{ Bindings: Env }>()

toolsApi.route('/', files)
toolsApi.route('/', prs)
toolsApi.route('/', issues)
toolsApi.route('/', github)
toolsApi.route('/', kv)
toolsApi.route('/', comments)
toolsApi.route('/', healthCheck)

import { z } from "zod";
import * as S from "@/schemas/apiSchemas";
import { MCPTool } from "@/ai/mcp/index";
import { DEFAULT_GITHUB_OWNER } from "@github-utils";

export const GITHUB_TOOLS: MCPTool[] = [
    {
        name: "searchRepositories",
        description: "Search for GitHub repositories using advanced query syntax",
        category: "GitHub Search",
        tags: ["github", "search", "repositories"],
        inputSchema: S.SearchRepositoriesRequest,
        examples: [
            {
                input: {
                    q: "language:typescript stars:>100",
                    sort: "stars",
                    order: "desc",
                    per_page: 10,
                },
                output: { success: true, total_count: 1234, items: [] },
            },
        ],
    },
    {
        name: "upsertFile",
        description: "Create or update a file in a GitHub repository",
        category: "GitHub Files",
        tags: ["github", "files", "write"],
        inputSchema: S.UpsertFileRequest,
        examples: [
            {
                input: {
                    owner: "octocat",
                    repo: "hello-world",
                    path: "README.md",
                    content: "# Hello World\n\nThis is a test.",
                    message: "Update README",
                },
                output: { success: true, content: { name: "README.md", path: "README.md", sha: "abc" } },
            },
        ],
    },
    {
        name: "createIssue",
        description: "Create a new issue in a GitHub repository",
        category: "GitHub Issues",
        tags: ["github", "issues", "create"],
        inputSchema: S.CreateIssueRequest,
        examples: [
            {
                input: {
                    owner: "octocat",
                    repo: "hello-world",
                    title: "Bug: App crashes",
                    body: "Trace...",
                    labels: ["bug"],
                },
                output: { success: true, issue: { number: 42, title: "Bug", state: "open" } },
            },
        ],
    },
    {
        name: "createPullRequest",
        description: "Create a new pull request in a GitHub repository",
        category: "GitHub Pull Requests",
        tags: ["github", "pull-requests", "create"],
        inputSchema: S.CreatePullRequestRequest,
        examples: [
            {
                input: {
                    owner: "octocat",
                    repo: "hello-world",
                    title: "feat: Add new feature",
                    head: "feature-branch",
                    base: "main",
                },
                output: { success: true, pull_request: { number: 42, title: "feat", state: "open" } },
            },
        ],
    },
    {
        name: "listRepoTree",
        description: "List repository contents with a tree-style representation",
        category: "GitHub Files",
        tags: ["github", "files", "tree"],
        inputSchema: z.object({
            owner: z.string().default(DEFAULT_GITHUB_OWNER).describe("Repository owner"),
            repo: z.string().describe("Repository name"),
            path: z.string().optional().describe("Path in repository (optional)"),
            branch: z.string().optional().describe("Branch name (optional)"),
        }),
    },
];

export default toolsApi;
