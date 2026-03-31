import { OpenAPIHono } from '@hono/zod-openapi';
import { WorkerManager } from '@/services/cloudflare/worker-manager';

const bindingsApi = new OpenAPIHono<{ Bindings: Env }>();

// GET bindings for a specific worker
bindingsApi.get('/worker/:workerName/bindings', async (c) => {
  try {
    const { getCloudflareApiToken, getCloudflareAccountId } = await import('@utils/secrets');
    const accountId = await getCloudflareAccountId(c.env);
    const apiToken = await getCloudflareApiToken(c.env);

    if (!accountId || !apiToken) {
      return c.json({ success: false, error: 'Missing Cloudflare credentials' }, 401);
    }

    const workerName = c.req.param('workerName');
    const manager = new WorkerManager(apiToken, accountId);

    const bindings = await manager.listBindings(workerName);

    return c.json({ success: true, bindings });
  } catch (error: any) {
    console.error('Failed to get bindings:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// GET full script info
bindingsApi.get('/worker/:workerName', async (c) => {
  try {
    const { getCloudflareApiToken, getCloudflareAccountId } = await import('@utils/secrets');
    const accountId = await getCloudflareAccountId(c.env);
    const apiToken = await getCloudflareApiToken(c.env);

    if (!accountId || !apiToken) {
      return c.json({ success: false, error: 'Missing Cloudflare credentials' }, 401);
    }

    const workerName = c.req.param('workerName');
    const manager = new WorkerManager(apiToken, accountId);

    const script = await manager.getScript(workerName);

    return c.json({ success: true, script });
  } catch (error: any) {
    console.error('Failed to get script:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default bindingsApi;
