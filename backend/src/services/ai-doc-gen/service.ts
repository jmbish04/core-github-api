import { Octokit } from "@octokit/rest";

export interface AiDocGenRequest {
  owner: string;
  repo: string;
  branch?: string;
  customInstructions?: string;
}

export interface AiDocGenResult {
  branchName: string;
  prNumber: number;
  prUrl: string;
  generatedPaths: string[];
}

const SAFE_MARKDOWN_FILENAME = /^[a-z0-9][a-z0-9._-]*\.md$/i;

export const IMPLEMENT_FEATURE_WORKFLOW_PATH = ".agent/workflows/implement-feature.md";
export const DOC_GEN_STANDARDS_PATH = ".agent/rules/doc-gen-standards.md";

export const IMPLEMENT_FEATURE_WORKFLOW_CONTENT = `# Implementation Plan: Agentic AI-Doc Generator
1. **Wrangler Binding**: Add \`ANALYZER_DO\`, \`DOCUMENTER_DO\`, and \`RULES_GEN_DO\` to \`wrangler.jsonc\` bindings and migrations.
2. **Backend Agent Logic**: Implement Honi tools and \`createAgent\` definitions in \`backend/src/services/ai-doc-gen/agents.ts\`, exporting the DO classes.
3. **Coordinator Service**: Write the logic to fetch repo files, pass them sequentially through the Honi agent handlers via HTTP/fetch, and compile the target markdown file contents.
4. **API Endpoint**: Implement \`POST /tools/github/repos/doc-gen\` utilizing the Personal Access Token (PAT) Octokit client to ensure the PR is attributed to the User.
5. **Frontend Modal**: Create \`AiDocGenModal.tsx\` using Shadcn Dialog, Button, and Textarea components.
6. **Frontend Integration**: Inject the trigger button into the Project Dashboard's Repo Tools DropdownMenu.
`;

export const DOC_GEN_STANDARDS_CONTENT = `# AI Document Generation Standards
- **Framework**: AI Agents must be built strictly using the \`honidev\` framework leveraging Cloudflare Durable Objects.
- **Observability**: All Honi agents must include the \`observability\` config object to map to Cloudflare AI Gateway.
- **File Output Paths**: Architectural docs must go to \`.ai/docs/\` and agent instructions must go to \`.agent/rules/\`.
- **Identity**: Pull Requests containing generated docs MUST use the PAT (\`usePat: true\` or direct env injection) so the PR does not get flagged as \`[bot]\`.
- **Chaining**: The Documenter and Rules Generator agents must wait for the Analyzer's output to use as their primary system context.
`;

function stripCodeFences(value: string) {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/^```(?:json|markdown)?\s*([\s\S]*?)\s*```$/i);
  return (fencedMatch?.[1] ?? trimmed).trim();
}

function toDebugMarkdownBlock(value: string) {
  return ["```text", stripCodeFences(value), "```"].join("\n");
}

function parseJsonObject(value: string): Record<string, unknown> {
  const sanitized = stripCodeFences(value);
  return JSON.parse(sanitized) as Record<string, unknown>;
}

function sanitizeMarkdownFilename(filename: string) {
  const normalized = filename.split("/").pop()?.trim() ?? "";
  if (!SAFE_MARKDOWN_FILENAME.test(normalized)) {
    throw new Error(`Unsafe generated markdown filename: ${filename}`);
  }
  return normalized;
}

function hasStatus(error: unknown, status: number) {
  return typeof error === "object"
    && error !== null
    && "status" in error
    && (error as { status?: unknown }).status === status;
}

function normalizeMarkdownRecord(
  value: unknown,
  prefix: ".ai/docs" | ".agent/rules",
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map<string, string>();
  }

  const entries = Object.entries(value).filter(([, content]) => typeof content === "string" && content.trim());
  const fileMap = new Map<string, string>();

  for (const [filename, content] of entries) {
    const safeFilename = sanitizeMarkdownFilename(filename);
    fileMap.set(`${prefix}/${safeFilename}`, String(content).trim());
  }

  return fileMap;
}

export function buildGeneratedFileMap(
  documenterFiles: unknown,
  rulesFiles: unknown,
) {
  const fileMap = new Map<string, string>();

  for (const [path, content] of normalizeMarkdownRecord(documenterFiles, ".ai/docs")) {
    fileMap.set(path, content);
  }

  for (const [path, content] of normalizeMarkdownRecord(rulesFiles, ".agent/rules")) {
    fileMap.set(path, content);
  }

  fileMap.set(IMPLEMENT_FEATURE_WORKFLOW_PATH, IMPLEMENT_FEATURE_WORKFLOW_CONTENT.trim());
  fileMap.set(DOC_GEN_STANDARDS_PATH, DOC_GEN_STANDARDS_CONTENT.trim());

  return fileMap;
}

async function getPatOctokit(env: Env) {
  const { getGithubPersonalAccessToken } = await import("../../utils/secrets");
  const token = await getGithubPersonalAccessToken(env);
  if (!token) {
    throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN is required for AI doc generation PRs.");
  }

  return new Octokit({ auth: token });
}

async function getExistingFileSha(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  path: string,
) {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
    if (Array.isArray(data) || data.type !== "file") return undefined;
    return data.sha;
  } catch (error: unknown) {
    if (hasStatus(error, 404)) {
      return undefined;
    }
    throw error;
  }
}

function createAnalyzerPrompt(input: Required<AiDocGenRequest>) {
  return [
    `Analyze the repository ${input.owner}/${input.repo} on branch ${input.branch}.`,
    "Use the repository tools to inspect the codebase before answering.",
    input.customInstructions
      ? `Custom instructions: ${input.customInstructions}`
      : "Custom instructions: None provided.",
  ].join("\n");
}

function createDocumenterPrompt(input: Required<AiDocGenRequest>, analysis: string) {
  return [
    `Generate architectural markdown files for ${input.owner}/${input.repo}.`,
    "Use the analyzer output below as your primary source of truth.",
    analysis,
    input.customInstructions
      ? `Additional instructions: ${input.customInstructions}`
      : "Additional instructions: Focus on architecture, API surfaces, and repo structure.",
  ].join("\n\n");
}

function createRulesPrompt(input: Required<AiDocGenRequest>, analysis: string) {
  return [
    `Generate repository rule markdown for ${input.owner}/${input.repo}.`,
    "Use the analyzer output below as your primary source of truth.",
    analysis,
    input.customInstructions
      ? `Additional instructions: ${input.customInstructions}`
      : "Additional instructions: Focus on preserving repo conventions and safe automation.",
  ].join("\n\n");
}

function createPullRequestBody(paths: string[], baseBranch: string) {
  return [
    "## Summary",
    "",
    "This PR was generated by the AI Doc Generator and adds repository architecture docs plus agent rules.",
    "",
    `- Base branch: \`${baseBranch}\``,
    "- Generated files:",
    ...paths.map((path) => `  - \`${path}\``),
  ].join("\n");
}

export class AiDocGenService {
  static async generateFiles(
    env: Env,
    input: AiDocGenRequest,
  ): Promise<Map<string, string>> {
    const octokit = await getPatOctokit(env);
    const repoData = await octokit.repos.get({ owner: input.owner, repo: input.repo });
    const resolvedInput: Required<AiDocGenRequest> = {
      owner: input.owner,
      repo: input.repo,
      branch: input.branch || repoData.data.default_branch,
      customInstructions: input.customInstructions?.trim() || "",
    };
    const {
      runAnalyzerAgent,
      runDocumenterAgent,
      runRulesGeneratorAgent,
    } = await import("./agents");

    const threadRoot = `${resolvedInput.owner}-${resolvedInput.repo}-${Date.now()}`;
    const analyzerResponse = await runAnalyzerAgent(
      env,
      `${threadRoot}-analyzer`,
      createAnalyzerPrompt(resolvedInput),
    );

    const documenterResponse = await runDocumenterAgent(
      env,
      `${threadRoot}-documenter`,
      createDocumenterPrompt(resolvedInput, analyzerResponse),
    );

    const rulesResponse = await runRulesGeneratorAgent(
      env,
      `${threadRoot}-rules`,
      createRulesPrompt(resolvedInput, analyzerResponse),
    );

    let documenterFiles: Record<string, unknown> = {};
    let rulesFiles: Record<string, unknown> = {};

    try {
      documenterFiles = parseJsonObject(documenterResponse);
    } catch {
      documenterFiles = {
        "structure_analysis.md": `# Structure Analysis\n\n${stripCodeFences(analyzerResponse)}`,
        "api_analysis.md": [
          "# API Analysis",
          "",
          "The documenter agent returned non-JSON output, so manual review is required.",
          "",
          "## Raw agent response",
          "",
          toDebugMarkdownBlock(documenterResponse),
        ].join("\n"),
      };
    }

    try {
      rulesFiles = parseJsonObject(rulesResponse);
    } catch {
      rulesFiles = {
        "repo-doc-gen-rules.md": [
          "# Repository Doc Generation Rules",
          "",
          "The rules agent returned non-JSON output, so the analyzer summary has been preserved for manual follow-up.",
          "",
          "## Analyzer summary",
          "",
          stripCodeFences(analyzerResponse),
          "",
          "## Raw agent response",
          "",
          toDebugMarkdownBlock(rulesResponse),
        ].join("\n"),
      };
    }

    return buildGeneratedFileMap(documenterFiles, rulesFiles);
  }

  static async createPullRequest(
    env: Env,
    input: AiDocGenRequest,
  ): Promise<AiDocGenResult> {
    const octokit = await getPatOctokit(env);
    const repoData = await octokit.repos.get({ owner: input.owner, repo: input.repo });
    const baseBranch = input.branch || repoData.data.default_branch;
    const generatedFiles = await this.generateFiles(env, { ...input, branch: baseBranch });
    const branchName = `docs/ai-doc-gen-${Date.now()}`;

    const { data: baseRef } = await octokit.git.getRef({
      owner: input.owner,
      repo: input.repo,
      ref: `heads/${baseBranch}`,
    });

    await octokit.git.createRef({
      owner: input.owner,
      repo: input.repo,
      ref: `refs/heads/${branchName}`,
      sha: baseRef.object.sha,
    });

    for (const [path, content] of generatedFiles) {
      const sha = await getExistingFileSha(octokit, input.owner, input.repo, branchName, path);
      await octokit.repos.createOrUpdateFileContents({
        owner: input.owner,
        repo: input.repo,
        branch: branchName,
        path,
        sha,
        message: `docs(ai): generate ${path}`,
        content: Buffer.from(content, "utf-8").toString("base64"),
      });
    }

    const { data: pr } = await octokit.pulls.create({
      owner: input.owner,
      repo: input.repo,
      head: branchName,
      base: baseBranch,
      title: "docs(ai): Generate Architecture and Agent Rules",
      body: createPullRequestBody([...generatedFiles.keys()], baseBranch),
    });

    return {
      branchName,
      prNumber: pr.number,
      prUrl: pr.html_url,
      generatedPaths: [...generatedFiles.keys()],
    };
  }
}
