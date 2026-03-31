import type { SyncRepositoryTarget } from "@/automations/push/orchestration/sync";

export async function listRepositoryFiles(octokit: any, target: SyncRepositoryTarget): Promise<string[]> {
  try {
    const { data } = await octokit.rest.git.getTree({
      owner: target.owner,
      repo: target.name,
      tree_sha: target.defaultBranch,
      recursive: 'true',
    });

    return data.tree
      .map((entry: { path?: string | null }) => entry.path || '')
      .filter(Boolean);
  } catch (error) {
    console.warn('[GardenerSync] Failed to list repository files while building manifest.', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Dynamic skill fetcher
// ---------------------------------------------------------------------------

/**
 * Minimal env shape required by fetchDynamicSkill.
 * Fulfilled by Cloudflare `Env` — GITHUB_TOKEN is a SecretStore binding.
 */
export interface SkillFetcherEnv {
  GITHUB_TOKEN: { get(): Promise<string> } | string | undefined;
  GITHUB_REPO_STANDARDIZATION: string | undefined;
}

/**
 * Fetches a SKILL.md file from a central GitHub repository at runtime.
 *
 * Uses `mediaType: { format: "raw" }` to bypass base64 encoding on the Edge.
 * Fails open — returns an empty string (or a warning) so the agent still boots
 * with its baseline system instructions if the fetch fails.
 *
 * @param env       - Worker env bindings (must contain GITHUB_TOKEN + GITHUB_REPO_STANDARDIZATION)
 * @param skillPath - Path within the repo, e.g. "skills/agents-sdk/SKILL.md"
 */
export async function fetchDynamicSkill(
  env: SkillFetcherEnv,
  skillPath: string = "skills/agents-sdk/SKILL.md"
): Promise<string> {
  if (!env.GITHUB_TOKEN) {
    console.warn("[fetchDynamicSkill] GITHUB_TOKEN is not set. Skipping dynamic skill fetch.");
    return "";
  }

  if (!env.GITHUB_REPO_STANDARDIZATION) {
    console.warn("[fetchDynamicSkill] GITHUB_REPO_STANDARDIZATION is not set. Expected format: 'owner/repo'.");
    return "";
  }

  const [owner, repo] = env.GITHUB_REPO_STANDARDIZATION.split("/");
  if (!owner || !repo) {
    console.error(`[fetchDynamicSkill] Invalid GITHUB_REPO_STANDARDIZATION format: '${env.GITHUB_REPO_STANDARDIZATION}'. Expected 'owner/repo'.`);
    return "";
  }

  // Resolve the github token — supports both SecretStore bindings (.get()) and plain strings.
  let token: string | undefined;
  try {
    token = typeof env.GITHUB_TOKEN === "string"
      ? env.GITHUB_TOKEN
      : await env.GITHUB_TOKEN.get();
  } catch {
    console.warn("[fetchDynamicSkill] Failed to resolve GITHUB_TOKEN from SecretStore.");
    return "";
  }

  if (!token) {
    console.warn("[fetchDynamicSkill] GITHUB_TOKEN resolved to empty. Skipping.");
    return "";
  }

  // Dynamic import — keeps the module tree Edge-safe; avoids bundling the full Octokit at startup.
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: token });

  try {
    // `format: "raw"` instructs the GitHub API to return the file content as a raw string
    // directly in `response.data`, bypassing all base64 encoding.
    const response = await (octokit.repos.getContent as any)({
      owner,
      repo,
      path: skillPath,
      mediaType: { format: "raw" },
    });

    if (typeof response.data === "string") {
      return response.data;
    }

    throw new Error("Unexpected payload type from GitHub API (expected raw string).");
  } catch (error) {
    console.error(`[fetchDynamicSkill] Failed to fetch '${skillPath}' from ${owner}/${repo}:`, error);
    // Fail open — return a clearly labelled warning so the agent does not crash.
    return `\n> ⚠️ Warning: Failed to load dynamic skill from '${skillPath}'. Agent is operating on base instructions only.\n`;
  }
}