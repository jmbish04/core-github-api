import { OpenAPIHono, z } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';
import { drizzle } from 'drizzle-orm/d1';
import { research_judgments } from '@/db/schemas/app/research_judgments';
import { getWorkerApiKey } from '@/utils/secrets';
import { BroadcastClient } from '@utils/do-broadcast';

const researchJudgeApi = new OpenAPIHono<{ Bindings: Env }>();

export const RepoFindingSchema = z.object({
  name: z.string(),
  url: z.string(),
  stars: z.number(),
  description: z.string().nullable().optional(),
  relevance_score: z.number()
});

export const ResearchJudgePayloadSchema = z.object({
  prompt: z.string(),
  status: z.enum(["pass", "needs_more_data", "fail"]),
  judge_notes: z.string(),
  findings: z.array(RepoFindingSchema)
});

researchJudgeApi.post('/', zValidator('json', ResearchJudgePayloadSchema), async (c) => {
  // Validate API Key
  const apiKey = c.req.header('X-API-Key');
  const workerApiKey = await getWorkerApiKey(c.env);
  if (!apiKey || !workerApiKey || apiKey !== workerApiKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = c.req.valid('json');
  const db = drizzle(c.env.DB);

  // Insert into DB
  await db.insert(research_judgments).values({
    id: crypto.randomUUID(),
    prompt: payload.prompt,
    status: payload.status,
    judgeNotes: payload.judge_notes,
    findings: JSON.stringify(payload.findings),
    createdAt: new Date().toISOString()
  });

  // Broadcast
  try {
    await BroadcastClient.broadcast(c.env.ROOM_DO, "global", {
      type: "research_judge_completed",
      payload: { status: payload.status, prompt: payload.prompt }
    });
  } catch (e) {
    console.error("Failed to broadcast research_judge_completed:", e);
  }

  return c.json({ success: true, processed: true });
});

export default researchJudgeApi;
