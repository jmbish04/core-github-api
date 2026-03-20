please create a script for jules that will check in on a jules session, like snapshot and will then start a series of conditional handling 

if the latest update on snapshot is something like `- **[agentMessaged]** Agent: The CI failure "Workers Builds: jules-n-stitch" appears to be related to the Cloudflare Workers buil... _(2026-03-18T12:51:26.552852Z)_
` .. where CI failure occurs .. then the JulesOverseer.ts should then use cloudflare tools to check the build status of the worker and obtain the build logs ...

1) Check the current pr for https://github.com/{owner}/{repo_name}/pull/{pr_#}/checks and if there is a Workers Builds: ci/cd ... pull the build id from this response 

2) Query cloudflare api for the build id and obtain the build logs 

3) The julesoverseer should investigate the logs and use cloudflare docs mcp for verifying the fix 

4) The julesoverseer should send the prompt to jules to correct the build error and also send jules the build log for context



import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { apiReference } from '@scalar/hono-api-reference';
import { Octokit } from '@octokit/rest';

export type Bindings = {
  GITHUB_TOKEN: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
};

const app = new OpenAPIHono<{ Bindings: Bindings }>();

const HealthSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().datetime()
}).openapi('Health');

const ContextSchema = z.object({
  environment: z.string(),
  runtime: z.string()
}).openapi('Context');

const LogExtractionParams = z.object({
  owner: z.string().openapi({ example: 'jmbish04' }),
  repo: z.string().openapi({ example: 'jules-n-stitch' }),
  check_run_id: z.string().openapi({ example: '67574754432' }),
});

const LogExtractionResponse = z.object({
  check_run_id: z.string(),
  build_id: z.string().nullable(),
  logs: z.any().nullable(),
  error: z.string().optional()
}).openapi('LogExtractionResponse');

app.openapi(
  createRoute({
    method: 'get',
    path: '/health',
    responses: {
      200: {
        description: 'Health check endpoint',
        content: { 'application/json': { schema: HealthSchema } }
      }
    }
  }),
  (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/context',
    responses: {
      200: {
        description: 'Deployment context endpoint',
        content: { 'application/json': { schema: ContextSchema } }
      }
    }
  }),
  (c) => c.json({ environment: 'production', runtime: 'cloudflare-workers' })
);

app.get('/docs', (c) => c.redirect('/scalar'));

app.openapi(
  createRoute({
    method: 'get',
    path: '/api/logs/{owner}/{repo}/{check_run_id}',
    request: {
      params: LogExtractionParams
    },
    responses: {
      200: {
        description: 'Successfully fetched and combined check run data with Cloudflare build logs.',
        content: { 'application/json': { schema: LogExtractionResponse } }
      },
      500: {
        description: 'Internal server error or external API failure.',
        content: { 'application/json': { schema: LogExtractionResponse } }
      }
    }
  }),
  async (c) => {
    const { owner, repo, check_run_id } = c.req.valid('param');
    const { GITHUB_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID } = c.env;

    if (!GITHUB_TOKEN || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
      return c.json({ 
        check_run_id, 
        build_id: null, 
        logs: null, 
        error: 'Missing required environment variables (GITHUB_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID).' 
      }, 500);
    }

    try {
      const octokit = new Octokit({ auth: GITHUB_TOKEN });
      const checkRunIdNum = parseInt(check_run_id, 10);

      const { data: checkRun } = await octokit.rest.checks.get({
        owner,
        repo,
        check_run_id: checkRunIdNum,
      });

      const textToSearch = [
        checkRun.external_id,
        checkRun.output?.title,
        checkRun.output?.summary,
        checkRun.output?.text,
        checkRun.details_url
      ].filter(Boolean).join(' ');

      const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
      const match = textToSearch.match(uuidRegex);
      const buildId = match ? match[0] : null;

      if (!buildId) {
        return c.json({
          check_run_id,
          build_id: null,
          logs: null,
          error: 'Could not parse a Cloudflare Build ID (UUID v4) from the GitHub Check Run metadata or output.'
        });
      }

      const cfRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/builds/builds/${buildId}/logs`, {
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!cfRes.ok) {
        const errorText = await cfRes.text();
        throw new Error(`Cloudflare API error: ${cfRes.status} ${errorText}`);
      }

      const cfData = await cfRes.json<{ result: any }>();

      return c.json({
        check_run_id,
        build_id: buildId,
        logs: cfData.result || cfData
      });

    } catch (e: any) {
      return c.json({
        check_run_id,
        build_id: null,
        logs: null,
        error: e.message || 'An unknown error occurred while fetching logs.'
      }, 500);
    }
  }
);

app.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Cloudflare CI/CD Logs Extractor API',
    version: '1.0.0',
    description: 'Bridges GitHub Check Runs and Cloudflare Workers Builds to retrieve raw log artifacts.'
  },
});

app.get('/swagger', swaggerUI({ url: '/openapi.json' }));
app.get('/scalar', apiReference({ spec: { url: '/openapi.json' } }));

export default app;