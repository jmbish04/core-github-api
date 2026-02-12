export { };

declare global {
  namespace Cloudflare {
    interface Env {
      // Secrets and Config not in wrangler.jsonc
      GOOGLE_API_KEY: string;
      GEMINI_API_KEY: string;
      WORKER_API_KEY: string;
      GITHUB_WEBHOOK_SECRET?: string;
      GITHUB_TOKEN: string;
      AI_GATEWAY_NAME: string;
      AI_GATEWAY_URL?: string;
      AI_GATEWAY_TOKEN?: string;
      AI_DEFAULT_PROVIDER?: string;
      AI_DEFAULT_MODEL?: string;
      WORKERS_AI_MODEL?: string;
      CLOUDFLARE_API_TOKEN?: string;
      CLOUDFLARE_ACCOUNT_ID?: string;
      CLOUDFLARE_WORKER_NAME?: string;
      GITHUB_ACTION_CLOUDFLARE_ACCOUNT_ID?: string;
      GITHUB_APP_ID: string;
      GITHUB_APP_PRIVATE_KEY: string;
    }
  }
}
