
import { getOctokit } from "@services/octokit/core";

export class McpSync {
    private static MASTER_OWNER = "jmbish04";
    private static MASTER_REPO = "core-github-standardization";
    private static MASTER_PATH = "mcp.json";

    static async syncMcpConfig(env: Env, targetOwner: string, targetRepo: string) {
        const octokit = await getOctokit(env);

        console.log(`[McpSync] Fetching master mcp.json from ${this.MASTER_OWNER}/${this.MASTER_REPO}...`);

        let masterContent: string = "";
        let masterSha: string = "";

        // 1. Fetch from Master
        try {
            const { data } = await octokit.rest.repos.getContent({
                owner: this.MASTER_OWNER,
                repo: this.MASTER_REPO,
                path: this.MASTER_PATH,
            });

            if ("content" in data) {
                masterContent = data.content; // base64
                masterSha = data.sha;
            } else {
                console.error("[McpSync] Master mcp.json is not a file.");
                return;
            }
        } catch (err) {
            console.error("[McpSync] Failed to fetch master mcp.json:", err);
            return;
        }

        // 2. Check Target for existing file to get SHA (for update)
        let targetSha: string | undefined;
        try {
            const { data: targetData } = await octokit.rest.repos.getContent({
                owner: targetOwner,
                repo: targetRepo,
                path: "mcp.json",
            });
            if ("sha" in targetData) {
                targetSha = targetData.sha;
            }
            
            // Optimization: If content is same, skip? 
            // We'd need to decode/normalize JSON to be sure, or just overwrite since we want *Strict Override*.
            // "Strict Override" implies we don't care what they have, we replace it.
        } catch (err: any) {
            if (err.status !== 404) {
               console.warn(`[McpSync] Error checking target mcp.json: ${err.message}`);
            }
            // 404 means file doesn't exist, which is fine, we'll create it.
        }

        // 3. Push to Target (Strict Override)
        try {
            await octokit.rest.repos.createOrUpdateFileContents({
                owner: targetOwner,
                repo: targetRepo,
                path: "mcp.json",
                message: `chore(standardization): sync mcp.json from ${this.MASTER_REPO}`,
                content: masterContent,
                sha: targetSha,
            });
            console.log(`[McpSync] Successfully synced mcp.json to ${targetOwner}/${targetRepo}`);
        } catch (err) {
            console.error(`[McpSync] Failed to push mcp.json to ${targetOwner}/${targetRepo}:`, err);
        }
    }
}
