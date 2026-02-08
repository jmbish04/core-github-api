import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Bindings } from '../../utils/hono';
import { LandingGeneratorService } from '../../services/landingGenerator/service';

const landingGeneratorApi = new OpenAPIHono<{ Bindings: Bindings }>();

const GenerateLandingPageSchema = z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    branch: z.string().optional().default('main').describe('Base branch'),
    prompt: z.string().optional().describe('Optional user prompt to guide AI analysis'),
});

const GenerateLandingPageResponseSchema = z.object({
    success: z.boolean(),
    prUrl: z.string(),
    prNumber: z.number().optional(),
    previewHtml: z.string().optional().describe('Generated HTML preview'),
});

const generateRoute = createRoute({
    method: 'post',
    path: '/generate',
    summary: 'Generate a landing page for a GitHub repository',
    description: 'Analyzes the repository using AI, generates a landing page, and opens a Pull Request.',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: GenerateLandingPageSchema,
                },
            },
            required: true,
        },
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: GenerateLandingPageResponseSchema,
                },
            },
            description: 'Landing page generated and PR created',
        },
        500: {
            description: 'Internal Server Error',
        },
    },
});

landingGeneratorApi.openapi(generateRoute, async (c) => {
    const { owner, repo, branch, prompt } = c.req.valid('json');

    try {
        // Auth check or Token retrieval
        const githubToken = c.env.GITHUB_TOKEN || c.env.WORKER_API_KEY;

        const result = await LandingGeneratorService.generateLandingPage(c.env, {
            owner,
            repo,
            prompt,
            githubToken
        });

        return c.json({
            success: true,
            prUrl: result.prUrl,
            prNumber: result.prNumber,
            // previewHtml: result.html // Service doesn't return HTML yet, but could.
        });
    } catch (error: any) {
        console.error('Landing Page Generation Error:', error);
        return c.json({
            success: false,
            prUrl: '',
            error: error.message,
        } as any, 500);
    }
});

export default landingGeneratorApi;
