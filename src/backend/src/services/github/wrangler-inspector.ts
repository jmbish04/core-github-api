import { Octokit } from "octokit";
import { WranglerConfigSchema, type WranglerConfig } from "@/types/cloudflare/deployment";
import { parseWranglerConfigContent, inferFormat, type ConfigFormat, type ParseResult } from "@/automations/shared/cloudflare/wrangler-config-parser";
import { WranglerConfigUpdater, type UpdateOperation, type UpdateResult } from "@/automations/shared/cloudflare/wrangler-config-updater";

export class WranglerInspectorService {
  constructor(private octokit: Octokit) {}

  /**
   * Examines a repo for wrangler configs and returns a validated WranglerConfig object.
   * Uses the full, strict schema from deployment.ts.
   */
  async getWranglerConfig(owner: string, repo: string, path: string = ""): Promise<WranglerConfig> {
    const raw = await this.getWranglerConfigRaw(owner, repo, path);
    return raw.config;
  }

  /**
   * Fetches the raw content and parses it. Returns the ParseResult plus the original content string.
   */
  async getWranglerConfigRaw(owner: string, repo: string, path: string = ""): Promise<ParseResult & { content: string }> {
    const files = ["wrangler.jsonc", "wrangler.toml"];
    let content: string | null = null;
    let fileName: string | null = null;

    // 1. Try to find wrangler.jsonc (CF Preferred) then wrangler.toml
    for (const file of files) {
      try {
        const fullPath = path ? `${path}/${file}` : file;
        const { data } = await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path: fullPath,
        });

        if ("content" in data && !Array.isArray(data)) {
          content = Buffer.from(data.content, "base64").toString("utf-8");
          fileName = file;
          break;
        }
      } catch (e) {
        console.log("[WranglerInspectorService] File not found:", JSON.stringify(e));
        continue; // File not found, try next
      }
    }

    if (!content || !fileName) {
      throw new Error(`No wrangler configuration found in ${owner}/${repo}`);
    }

    // 2. Parse and Validate
    const format = inferFormat(fileName);
    const parsed = parseWranglerConfigContent(content, format, fileName);
    return { ...parsed, content };
  }

  /**
   * Fetches, updates, and commits a wrangler config in a single operation.
   * Uses WranglerConfigUpdater to preserve comments and formatting.
   */
  async updateAndCommitWranglerConfig(
    owner: string,
    repo: string,
    operations: UpdateOperation | UpdateOperation[],
    message: string = "chore: update wrangler config",
    path: string = ""
  ): Promise<{ commit: any; config: WranglerConfig }> {
    // 1. Get current content
    const current = await this.getWranglerConfigRaw(owner, repo, path);
    
    // 2. Apply updates in-memory
    const updater = new WranglerConfigUpdater("in-memory", current.format, current.content);
    const { content: newContent, config: newConfig } = updater.apply(operations);

    // 3. Commit back to GitHub
    const fullPath = path ? `${path}/${basename(current.filePath)}` : basename(current.filePath);
    
    // We need the SHA to update
    const { data: fileData } = await this.octokit.rest.repos.getContent({
      owner,
      repo,
      path: fullPath,
    });
    
    // Safety check for SHA presence
    if (Array.isArray(fileData) || !("sha" in fileData)) {
      throw new Error("Unexpected directory or missing SHA for config file: " + fullPath);
    }

    const commit = await this.octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: fullPath,
      message,
      content: Buffer.from(newContent).toString("base64"),
      sha: fileData.sha,
    });

    return { commit, config: newConfig };
  }
}

// Helper to extract basename for paths
function basename(path: string): string {
  return path.split('/').pop() ?? path;
}
