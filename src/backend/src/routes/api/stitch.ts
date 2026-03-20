import { OpenAPIHono, z } from '@hono/zod-openapi';
import { JulesService } from '@/services/jules/service';
import { Stitch, StitchToolClient } from '@google/stitch-sdk';

export const stitchApi = new OpenAPIHono<{ Bindings: Env }>();

const GenerateRequest = z.object({
  prompt: z.string().describe('The UI description to generate'),
  projectId: z.string().describe('Stitch Project ID'),
});

stitchApi.openapi(
  {
    method: 'post',
    path: '/generate',
    summary: 'Generate a UI component via Stitch and Shadcn-ify it with Jules',
    request: { body: { content: { 'application/json': { schema: GenerateRequest } } } },
    responses: {
      200: { description: 'Jules session initiated', content: { 'application/json': { schema: z.object({ sessionId: z.string(), message: z.string() }) } } },
      500: { description: 'Configuration Error', content: { 'application/json': { schema: z.object({ error: z.string() }) } } }
    }
  },
  async (c) => {
    const { prompt, projectId } = c.req.valid('json');
    const rawApiKey = c.env.STITCH_API_KEY;
    
    let apiKey = '';
    if (typeof rawApiKey === 'string') {
      apiKey = rawApiKey;
    } else if (rawApiKey && typeof (rawApiKey as any).get === 'function') {
      apiKey = await (rawApiKey as any).get();
    }
    
    if (!apiKey) {
      return c.json({ error: 'STITCH_API_KEY is not configured.' }, 500);
    }

    const client = new Stitch(new StitchToolClient({ apiKey }));
    const jules = JulesService.getInstance(c.env as any);
    
    // Background generation and Jules pipeline
    c.executionCtx.waitUntil((async () => {
      try {
        console.log(`[Stitch] Generating screen for project ${projectId}...`);
        
        let htmlPayload = '';
        try {
          const project = client.project(projectId);
          const screen = await project.generate(prompt);
          htmlPayload = await screen.getHtml();
        } catch (generatorErr: any) {
          console.error('[Stitch] Core generation failed', generatorErr);
          htmlPayload = `<!-- Error generating HTML: ${generatorErr.message} -->`;
        }

        const julesPrompt = `
You are a master Shadcn UI developer.
The user wanted to generate: "${prompt}".

Convert the following raw HTML into a proper React component 
using our internal Shadcn UI registry and Astro/React best practices.
Format the output as a clean, complete .tsx file ready to drop into \`frontend/src/components/generated/\`.

HTML Payload:
\`\`\`html
${htmlPayload}
\`\`\`
`.trim();

        await jules.startSession({
          prompt: julesPrompt,
          repo: { owner: 'jmbish04', repo: 'core-github-api', branch: 'main' },
          autoPr: true,
          requireApproval: false,
          sessionRole: 'frontend-specialist'
        });

      } catch (e: any) {
        console.error('[Stitch] Generation pipeline failed completely:', e);
      }
    })());

    return c.json({ sessionId: 'async', message: 'Stitch generation and Jules translation started in background.' }, 200);
  }
);

export default stitchApi;
