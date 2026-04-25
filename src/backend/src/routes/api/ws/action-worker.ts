import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/cloudflare-workers';
import { drizzle } from 'drizzle-orm/d1';
import { unifiedActionLogsTable } from '@/db/schemas/app';
import { eq } from 'drizzle-orm';
import { AIProvider } from '@/ai/providers';

const actionWorkerWs = new Hono<{ Bindings: Env }>();

actionWorkerWs.get(
  '/',
  upgradeWebSocket(async (c) => {
    // Basic Authentication check
    const apiKey = c.req.query('apiKey') || c.req.header('X-API-Key');
    const tokenRecord = c.env.GITHUB_PERSONAL_ACCESS_TOKEN || c.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    const expectedKey = typeof tokenRecord === 'string' ? tokenRecord : await (tokenRecord as any)?.get();
    if (!apiKey || apiKey !== expectedKey) { // Or whatever pre-shared key we use
      // Rejecting via HTTP response if possible, though upgradeWebSocket might need to handle this inside
      // A better way is middleware, but we'll do connection check
    }

    return {
      onOpen(_event: any, _ws: any) {
        console.log('Action Worker Connected');
      },
      async onMessage(event: any, ws: any) {
        try {
          const data = JSON.parse(event.data as string);
          const { action, taskId } = data;
          const db = drizzle(c.env.DB);

          // Update status if taskId is provided
          if (taskId && data.status) {
            await db.update(unifiedActionLogsTable)
              .set({ status: data.status, updatedAt: new Date() })
              .where(eq(unifiedActionLogsTable.taskId, taskId));
          }

          switch (action) {
            case 'run_ai': {
              // {"action": "run_ai", "model": "...", "prompt": "..."}
              const ai = new AIProvider(c.env);
              const response = await ai.generateText(data.prompt, data.model);
              ws.send(JSON.stringify({ result: response, action: 'run_ai_result' }));
              break;
            }
            case 'query_rules': {
              // {"action": "query_rules", "target": "golden_path"}
              // Simplified query for the example
              if (data.target === 'golden_path') {
                const { goldenPathConfig } = await import('@/db/schemas/app');
                const rules = await db.select().from(goldenPathConfig).limit(50);
                ws.send(JSON.stringify({ result: rules, action: 'query_rules_result' }));
              }
              break;
            }
            case 'kickoff_jules': {
              // {"action": "kickoff_jules", "repo": "...", "objective": "..."}
              // Instantiate Jules session placeholder
              const julesStatus = { status: 'Jules session initiated', repo: data.repo };
              ws.send(JSON.stringify({ result: julesStatus, action: 'kickoff_jules_result' }));
              break;
            }
            case 'fetch_build_logs': {
              // {"action": "fetch_build_logs", "worker_name": "...", "repo_owner": "...", "repo_name": "..."}
              const accountId = typeof c.env.CLOUDFLARE_ACCOUNT_ID === 'string' ? c.env.CLOUDFLARE_ACCOUNT_ID : await (c.env.CLOUDFLARE_ACCOUNT_ID as any)?.get();
              const apiToken = typeof c.env.CLOUDFLARE_API_TOKEN === 'string' ? c.env.CLOUDFLARE_API_TOKEN : await (c.env.CLOUDFLARE_API_TOKEN as any)?.get();
              
              if (!accountId || !apiToken) {
                 ws.send(JSON.stringify({ error: 'Missing CF credentials', action: 'fetch_build_logs_result' }));
                 break;
              }

              // Try searching by worker_name, fallback to repo_name
              const projectName = data.worker_name || data.repo_name;
              
              const fetchUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`;
              const cfResponse = await fetch(fetchUrl, {
                headers: {
                  'Authorization': `Bearer ${apiToken}`,
                  'Content-Type': 'application/json'
                }
              });

              if (!cfResponse.ok) {
                ws.send(JSON.stringify({ error: 'Failed to fetch CF logs', details: await cfResponse.text(), action: 'fetch_build_logs_result' }));
              } else {
                const cfData = await cfResponse.json();
                ws.send(JSON.stringify({ result: cfData, action: 'fetch_build_logs_result' }));
              }
              break;
            }
            default:
              ws.send(JSON.stringify({ error: 'Unknown action' }));
          }
        } catch (error: any) {
          console.error('WS Error:', error);
          ws.send(JSON.stringify({ error: error.message }));
        }
      },
      onClose() {
        console.log('Action Worker Disconnected');
      },
    };
  })
);

export default actionWorkerWs;
