// //import { Env } from '../../../../types';

export const getConfig = (env: Env): any => ({
    name: "cloudflare-builds",
    url: "https://builds.mcp.cloudflare.com/mcp",
    transport: {
        type: "streamable-http",
        headers: {
            "Authorization": `Bearer ${env.CLOUDFLARE_WRANGLER_API_TOKEN}`
        }
    }
});
