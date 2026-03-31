/**
 * @file worker-manager.ts
 * @description Cloudflare Official SDK wrapper for managing Worker scripts and bindings
 */

import Cloudflare from 'cloudflare';


export class WorkerManager {
  private cf: Cloudflare;
  
  constructor(private apiToken: string, private accountId: string) {
    this.cf = new Cloudflare({ apiToken });
  }

  /**
   * Fetches the detailed script metadata, including all active bindings, from Cloudflare API.
   * 
   * @param scriptName This is actually the "worker_name" (the "name" field set in wrangler.jsonc / wrangler.toml).
   * 
   * NOTE on Bindings Management Philosophy:
   * The goal of "bindings management" in this project is strictly to CREATE the bindings in the Cloudflare
   * ecosystem (e.g., provisioning a new D1 database via the API) and then updating the codebase config
   * (wrangler.jsonc) by submitting a PR or providing instructions to an agent.
   * The binding manager is NOT responsible for explicitly attaching these bindings to the Worker script 
   * directly via the API. That is handled by the normal CI/CD deployment pipeline when the PR is merged.
   */
  async listBindings(scriptName: string) {
    try {
      const script = await (this.cf as any).workers.scripts.get(scriptName, { account_id: this.accountId });
      return script.bindings || [];
    } catch (err: any) {
      console.error(`[WorkerManager] Failed to fetch bindings for ${scriptName}:`, err);
      throw err;
    }
  }

  /**
   * Fetches the raw Cloudflare script object.
   * 
   * @param scriptName The "worker_name" configured in the repository's wrangler.jsonc.
   */
  async getScript(scriptName: string) {
    return (this.cf as any).workers.scripts.get(scriptName, { account_id: this.accountId });
  }

  /**
   * Creates a live Cloudflare Worker tail session via the REST API.
   * Returns the URL proxy and expiration required for WebSocket handshake.
   */
  async createTailSession(scriptName: string) {
    // [REST] const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/workers/scripts/${scriptName}/tails`, {
    // [REST]   method: "POST",
    // [REST]   headers: {
    // [REST]     "Authorization": `Bearer ${this.apiToken}`,
    // [REST]     "Content-Type": "application/json"
    // [REST]   },
    // [REST]   body: JSON.stringify({})
    // [REST] });
    // [REST] 
    // [REST] if (!response.ok) {
    // [REST]   const text = await response.text();
    // [REST]   throw new Error(`Cloudflare API error: ${text}`);
    // [REST] }
    // [REST] 
    // [REST] const data: any = await response.json();
    // [REST] if (!data.success) {
    // [REST]   throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
    // [REST] }

    try {
      const result = await (this.cf as any).workers.scripts.tail.create(scriptName, {
        account_id: this.accountId,
      });

      return {
        id: result.id,
        url: result.url,
        expires_at: result.expires_at || undefined,
        scriptName
      };
    } catch (err: any) {
      throw new Error(`Cloudflare SDK error: ${err.message || String(err)}`);
    }
  }
}
