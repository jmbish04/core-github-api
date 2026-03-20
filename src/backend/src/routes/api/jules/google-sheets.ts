import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { JulesSessionBuilder } from "@/services/jules/builder";

const app = new Hono<{ Bindings: Env }>();

const schema = z.object({
  prompt: z.string().default("Review these translated strings and ensure JSON format corresponds."),
  sheetId: z.string().describe("ID of the Google Sheet"),
  range: z.string().default("Sheet1!A1:D100"),
  accessToken: z.string().describe("OAuth access token for Google APIs")
});

app.post("/", zValidator("json", schema), async (c) => {
  const { prompt, sheetId, range, accessToken } = c.req.valid("json");
  
  try {
    // Mocking the sheets fetch
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!res.ok) throw new Error(`Google Sheets API error: ${res.statusText}`);
    const data = await res.json() as any;
    const csvContent = data.values ? data.values.map((v: any[]) => v.join(",")).join("\n") : "Empty Sheet";
    
    const enrichedPrompt = `${prompt}\n\nSheet Data:\n${csvContent}`;

    const builder = new JulesSessionBuilder(c.env)
      .withPrompt(enrichedPrompt)
      .withoutApproval();

    const session = await builder.start();
    
    return c.json({ success: true, sessionId: session.id, rowsExtracted: data.values?.length || 0 });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
