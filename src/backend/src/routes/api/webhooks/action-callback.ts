import { OpenAPIHono, z } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { action_logs } from '@/db/schemas/app/action_logs';
import { getWorkerApiKey } from '@/utils/secrets';
import { BroadcastClient } from '@utils/do-broadcast';

const actionCallbackApi = new OpenAPIHono<{ Bindings: Env }>();

const CallbackSchema = z.object({
  taskId: z.string(),
  status: z.enum(['success', 'error']),
  message: z.string().optional(),
  data: z.record(z.string(), z.any()).optional()
});

actionCallbackApi.post('/', zValidator('json', CallbackSchema), async (c) => {
  // Validate API Key
  const apiKey = c.req.header('X-API-Key');
  const workerApiKey = await getWorkerApiKey(c.env);
  if (!apiKey || !workerApiKey || apiKey !== workerApiKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { taskId, status, message, data } = c.req.valid('json');
  const db = drizzle(c.env.DB);

  // Update DB Action Log
  await db.update(action_logs)
    .set({
      status,
      responsePayload: JSON.stringify({ message, data }),
      updatedAt: new Date().toISOString()
    })
    .where(eq(action_logs.taskId, taskId));

  // Route data to appropriate internal service
  // e.g. updating daily_trends or awesome_stars in D1
  // This logic should be placed in dedicated event handlers based on taskType,
  // but keeping it simple for now and broadcasting.

  try {
    await BroadcastClient.broadcast(c.env.ROOM_DO, "global", {
      type: "action_callback",
      payload: { taskId, status, message, data }
    });
  } catch (e) {
    console.error("Failed to broadcast action_callback:", e);
  }

  return c.json({ success: true, processed: true });
});

export default actionCallbackApi;
