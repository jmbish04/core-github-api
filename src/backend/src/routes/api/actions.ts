import { OpenAPIHono, z } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';
import { drizzle } from 'drizzle-orm/d1';
import { action_logs } from '@/db/schemas/app/action_logs';

const actionsApi = new OpenAPIHono<{ Bindings: Env }>();

const DispatchSchema = z.object({
  taskName: z.string(),
  targetRepo: z.string(),
  payload: z.record(z.string(), z.any())
});

actionsApi.post('/dispatch', zValidator('json', DispatchSchema), async (c) => {
  const { taskName, targetRepo, payload } = c.req.valid('json');
  const db = drizzle(c.env.DB);
  
  const taskId = crypto.randomUUID();
  
  // 1. Insert pending record
  await db.insert(action_logs).values({
    id: crypto.randomUUID(),
    taskId,
    actionType: taskName,
    targetRepo,
    status: 'pending',
    requestPayload: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // 2. Dispatch to GitHub
  const tokenRecord = c.env.GITHUB_TOKEN || c.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  const token = typeof tokenRecord === 'string' ? tokenRecord : await (tokenRecord as any)?.get();
  
  const callback_url = `${c.env.BASE_URL}/api/webhooks/action-callback`;
  
  const res = await fetch(c.env.GITHUB_ACTION_WORKER_DISPATCHER_URI, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${token}`,
      'User-Agent': 'core-github-api'
    },
    body: JSON.stringify({
      event_type: 'worker-task',
      client_payload: {
        ...payload,
        taskId,
        callback_url,
        taskName
      }
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Failed to dispatch: ${res.status} ${errorText}`);
    return c.json({ error: 'Failed to dispatch GitHub Action' }, 500);
  }

  return c.json({ success: true, taskId });
});

export default actionsApi;
