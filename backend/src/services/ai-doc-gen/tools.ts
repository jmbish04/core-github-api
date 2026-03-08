import { tool, z } from "honidev";
import { getOctokit } from "../octokit/core";

const RepoLocatorSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().min(1),
});

const safeTextContent = (content: string, maxChars: number) =>
  content.length > maxChars ? `${content.slice(0, maxChars)}\n\n[truncated]` : content;

async function resolveBranchSha(env: Env, owner: string, repo: string, branch: string) {
  const octokit = await getOctokit(env);
  const { data } = await octokit.repos.getBranch({ owner, repo, branch });
  return data.commit.sha;
}

export const readRepoTreeTool = tool({
  name: "read_repo_tree",
  description: "Read a GitHub repository tree for a branch and optionally focus on a subdirectory.",
  input: RepoLocatorSchema.extend({
    path: z.string().optional(),
    maxEntries: z.number().int().min(1).max(300).optional().default(200),
  }),
  handler: async ({ owner, repo, branch, path, maxEntries }, ctx) => {
    const env = ctx?.env as Env | undefined;
    if (!env) {
      throw new Error("Missing Worker environment for repository tree tool.");
    }

    const octokit = await getOctokit(env);
    const branchSha = await resolveBranchSha(env, owner, repo, branch);
    const { data } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: branchSha,
      recursive: "1",
    });

    const normalizedPath = path?.replace(/^\/+|\/+$/g, "");
    const filteredEntries = data.tree
      .filter((entry) => entry.path && entry.type)
      .filter((entry) => {
        if (!normalizedPath) return true;
        return entry.path === normalizedPath || entry.path?.startsWith(`${normalizedPath}/`);
      })
      .slice(0, maxEntries);

    const entries = filteredEntries.map((entry) => ({
      path: entry.path ?? "",
      type: entry.type ?? "blob",
      size: typeof entry.size === "number" ? entry.size : 0,
      sha: entry.sha ?? "",
    }));

    return {
      branch,
      truncated: (data.tree?.length ?? 0) > entries.length,
      entries,
      listing: entries
        .map((entry) => `${entry.type.padEnd(4)} ${entry.path}`)
        .join("\n"),
    };
  },
});

export const readFileContentTool = tool({
  name: "read_file_content",
  description: "Read the decoded content of a text file from a GitHub repository branch.",
  input: RepoLocatorSchema.extend({
    path: z.string().min(1),
    maxChars: z.number().int().min(100).max(40000).optional().default(20000),
  }),
  handler: async ({ owner, repo, branch, path, maxChars }, ctx) => {
    const env = ctx?.env as Env | undefined;
    if (!env) {
      throw new Error("Missing Worker environment for file content tool.");
    }

    const octokit = await getOctokit(env);
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    if (Array.isArray(data) || data.type !== "file" || !data.content) {
      throw new Error(`Path "${path}" is not a readable file.`);
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8");

    return {
      path,
      branch,
      size: content.length,
      content: safeTextContent(content, maxChars),
    };
  },
});

export const AI_DOC_TOOLS = [readRepoTreeTool, readFileContentTool];
