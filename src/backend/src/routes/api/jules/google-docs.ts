import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { fetchGoogleDoc } from "./_shared";
import { JulesSessionBuilder } from "@/services/jules/builder";

const app = new Hono<{ Bindings: Env }>();

const schema = z.object({
  prompt: z.string().default("Analyze this Google Doc and synthesize its plans into actionable code."),
  documentId: z.string().describe("ID of the Google Doc to extract text from"),
  accessToken: z.string().describe("OAuth access token for Google APIs")
});

app.post("/", zValidator("json", schema), async (c) => {
  const { prompt, documentId } = c.req.valid("json");
  
  try {
    const docText = await fetchGoogleDoc(c.env, documentId);
    const enrichedPrompt = `${prompt}\n\nDocument Constraints:\n${docText}`;

    const builder = new JulesSessionBuilder(c.env)
      .withPrompt(enrichedPrompt)
      .withoutApproval();

    const session = await builder.start();
    
    return c.json({ success: true, sessionId: session.id, extractPreview: docText.substring(0, 500) });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
