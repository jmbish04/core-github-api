export { };

declare global {
    interface Env {
        // Secrets and Config not in wrangler.jsonc
        GOOGLE_API_KEY: string;
        GEMINI_API_KEY: string;
        WORKER_API_KEY: string;
        GITHUB_TOKEN: string;
        AI_GATEWAY_URL?: string;
        AI_GATEWAY_TOKEN?: string;
        CLOUDFLARE_API_TOKEN?: string;
        GITHUB_ACTION_CLOUDFLARE_ACCOUNT_ID?: string;
        GITHUB_APP_ID: string;
        GITHUB_APP_PRIVATE_KEY: string;
        DB_WEBHOOKS: D1Database;
    }
}
