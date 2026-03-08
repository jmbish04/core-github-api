import { createAgent, tool } from 'honidev';
import { z } from 'zod';
import { Hono } from 'hono';

const LandingPageRefinementSchema = z.object({
    purpose: z.object({
        headline: z.string().optional(),
        tagline: z.string().optional(),
        valueStatement: z.string().optional(),
    }).optional(),
    branding: z.any().optional(),
    painPoints: z.array(z.object({
        title: z.string(),
        description: z.string(),
        solution: z.string(),
    })).optional(),
    metrics: z.array(z.object({
        value: z.string(),
        label: z.string(),
        trend: z.enum(["positive", "neutral", "negative"]).optional(),
    })).optional(),
}).passthrough();

export type LandingPageRefinementResponse = z.infer<typeof LandingPageRefinementSchema>;

export const { Agent, handler } = createAgent<Env>({
  name: "landing-page",
  model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  system: [
      "You are a Landing Page Refinement Agent.",
      "Your goal is to update the landing page configuration based on user feedback.",
      "Output ONLY a JSON object representing the *changes* or *new state* for 'customAnalysis'.",
      "Focus on: 'purpose' (headline, tagline), 'branding' (colors), 'painPoints', 'metrics'.",
      "Maintain existing structure where possible unless asked to change."
  ].join(" "),
  binding: "LANDING_PAGE_AGENT",
  tools: [],
  memory: {
     working: true
  },
  observability: { enabled: true, aiGatewaySlug: 'core-github-api', collectEvents: true }
});

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', agent: 'LandingPageAgent' }));
app.get('/docs', (c) => c.text('LandingPage Agent API Documentation'));
app.get('/context', (c) => c.json({ environment: 'Cloudflare Workers', agent: 'LandingPageAgent' }));
app.get('/openapi.json', (c) => c.json({ openapi: '3.1.0', info: { title: 'LandingPageAgent', version: '1.0.0' }, paths: {} }));

app.all('/*', (c) => handler.fetch(c.req.raw, c.env, c.executionCtx));

export default app;
export class LandingPageAgent extends Agent {}
