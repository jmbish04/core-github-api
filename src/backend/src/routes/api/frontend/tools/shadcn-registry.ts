import { OpenAPIHono } from '@hono/zod-openapi';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { Env } from '@/types';
import { generateText } from '@/ai/providers';
import { uxResearcherHandler } from '@/ai/agents/workshop/UxResearcher';

const app = new OpenAPIHono<{ Bindings: Env }>();

const modelName = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

app.post('/advise',
  zValidator('json', z.object({
    query: z.string(),
    registriesContext: z.string()
  })),
  async (c) => {
    const { query, registriesContext } = c.req.valid('json');

    const systemPrompt = `You are an expert UI/UX advisor for the shadcn/ui ecosystem.
You have access to the following registry data.
Your goal is to recommend the best registries for the user's project description.
1. Analyze the user's request.
2. Pick the top 1-3 most relevant registries from the provided list.
3. Explain WHY each one is a good fit in a friendly, concise manner.
4. If nothing fits perfectly, suggest "@shadcnui-blocks" or "@origin-ui" as a general-purpose fallback.

Format the output as a simple list. Use bolding for registry names. Add emoji where appropriate.`;

    const safePrompt = `Context:\n${registriesContext}\n\nUser Query: ${query}`;

    try {
      const textResponse = await generateText(
        c.env,
        safePrompt,
        systemPrompt,
        { model: modelName },
        'worker-ai'
      );

      return c.json({ result: textResponse });
    } catch (e: any) {
      console.error('AI Advisor error:', e);
      return c.json({ error: 'Failed to generate advice' }, 500);
    }
  }
);

app.post('/compare',
  zValidator('json', z.object({
    selectedRegistries: z.array(z.string())
  })),
  async (c) => {
    const { selectedRegistries } = c.req.valid('json');

    const systemPrompt = "You are a senior UI Engineer helping a developer choose a component library. Be critical, concise, and structured.";
    const safePrompt = `Compare the following UI registries.

Context Data for each:
${selectedRegistries.join('\n')}

Task:
Output a comparison in Markdown format.
1. A brief "At a Glance" summary of how they differ.
2. A comparison table with columns: 'Feature', and the selected registries. Rows to include: 'Core Aesthetic', 'Best Use Case', 'Complexity', 'Unique Strength'.
3. A 'Verdict' section explaining specifically when to choose which over the other.

Keep it practical for a developer.`;

    try {
      const textResponse = await generateText(
        c.env,
        safePrompt,
        systemPrompt,
        { model: modelName },
        'worker-ai'
      );
      return c.json({ result: textResponse });
    } catch (e: any) {
      console.error('AI Compare error:', e);
      return c.json({ error: 'Failed to generate comparison' }, 500);
    }
  }
);

app.post('/spark',
  zValidator('json', z.object({
    registryTitle: z.string()
  })),
  async (c) => {
    const { registryTitle } = c.req.valid('json');

    const systemPrompt = "You are a creative coding mentor.";
    const safePrompt = `Give me ONE unique, exciting, and specific project idea that uses the '${registryTitle}' shadcn registry.
Keep it to 2-3 sentences. Focus on what makes this specific registry unique.
Start with an emoji suitable for the idea.`;

    try {
      const textResponse = await generateText(
        c.env,
        safePrompt,
        systemPrompt,
        { model: modelName },
        'worker-ai'
      );
      return c.json({ result: textResponse });
    } catch (e: any) {
      console.error('AI Spark error:', e);
      return c.json({ error: 'Failed to generate idea' }, 500);
    }
  }
);

app.post('/research',
  zValidator('json', z.object({
    repoUrl: z.string().optional(),
    context: z.string(),
    registriesContext: z.string()
  })),
  async (c) => {
    const { repoUrl, context, registriesContext } = c.req.valid('json');

    const systemPrompt = "You are a senior UI/UX engineer and frontend architect. Analyze backend code, DB schemas, or PRDs to define the required frontend interface.";
    const safePrompt = `Analyze the repository context from: ${repoUrl || 'the user'}.

Available UI Registries:
${registriesContext}

Backend Code / Specs:
${context}

Task: Output a comprehensive Markdown architectural report prescribing the necessary frontend components.
Identify specific Shadcn UI elements (e.g. Card, Data Table, Dialog), map out screen flows, and define wireframe structures. Be highly specific and actionable.`;

    try {
      const textResponse = await generateText(
        c.env,
        safePrompt,
        systemPrompt,
        { model: modelName },
        'worker-ai'
      );
      return c.json({ result: textResponse });
    } catch (e: any) {
      console.error('AI Research error:', e);
      return c.json({ error: 'Failed to generate research' }, 500);
    }
  }
);

export default app;
