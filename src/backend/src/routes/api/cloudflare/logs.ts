/**
 * @file src/routes/api/cloudflare/logs.ts
 * @description Bridges GitHub Check Runs and Cloudflare Workers Builds to
 * retrieve raw build log artifacts. Consumed by JulesOverseer for CI
 * failure remediation.
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { CILogService } from '@/services/ci/CILogService';

const router = new OpenAPIHono<{ Bindings: Env }>();

// ─── Schemas ────────────────────────────────────────────────────────────────

const LogExtractionParams = z.object({
  owner: z.string().openapi({ example: 'jmbish04' }),
  repo: z.string().openapi({ example: 'core-github-api' }),
  check_run_id: z.string().openapi({ example: '67574754432' }),
});

const LogExtractionResponse = z
  .object({
    check_run_id: z.string(),
    build_id: z.string().nullable(),
    logs: z.string().nullable(),
    error: z.string().optional(),
  })
  .openapi('LogExtractionResponse');

const PRCheckRunsParams = z.object({
  owner: z.string().openapi({ example: 'jmbish04' }),
  repo: z.string().openapi({ example: 'core-github-api' }),
  pr: z.string().openapi({ example: '42' }),
});

const PRCheckRunsResponse = z
  .array(
    z.object({
      id: z.number(),
      name: z.string(),
      status: z.string(),
      conclusion: z.string().nullable(),
      detailsUrl: z.string().nullable(),
      externalId: z.string().nullable(),
      outputSummary: z.string().nullable(),
    }),
  )
  .openapi('PRCheckRuns');

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * GET /cloudflare/logs/:owner/:repo/:check_run_id
 * Given a specific GitHub Check Run ID, extracts the Cloudflare Build UUID
 * embedded in its metadata and returns the raw build logs.
 */
router.openapi(
  createRoute({
    method: 'get',
    path: '/logs/{owner}/{repo}/{check_run_id}',
    tags: ['CI / Logs'],
    summary: 'Fetch Cloudflare build logs for a GitHub check run',
    request: { params: LogExtractionParams },
    responses: {
      200: {
        description: 'Successfully fetched Cloudflare build logs.',
        content: { 'application/json': { schema: LogExtractionResponse } },
      },
      500: {
        description: 'External API failure.',
        content: { 'application/json': { schema: LogExtractionResponse } },
      },
    },
  }),
  async (c) => {
    const { owner, repo, check_run_id } = c.req.valid('param');
    const { GITHUB_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID } = c.env;

    const [ghToken, cfToken, cfAccountId] = await Promise.all([
      GITHUB_TOKEN.get(),
      CLOUDFLARE_API_TOKEN.get(),
      CLOUDFLARE_ACCOUNT_ID.get(),
    ]);

    if (!ghToken || !cfToken || !cfAccountId) {
      return c.json(
        {
          check_run_id,
          build_id: null,
          logs: null,
          error: 'Missing required secrets: GITHUB_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID',
        },
        500,
      );
    }

    const svc = new CILogService({ GITHUB_TOKEN: ghToken, CLOUDFLARE_API_TOKEN: cfToken, CLOUDFLARE_ACCOUNT_ID: cfAccountId });
    const result = await svc.getLogsForCheckRun(owner, repo, parseInt(check_run_id, 10));

    return c.json({
      check_run_id,
      build_id: result.buildId,
      logs: result.logs,
      ...(result.error ? { error: result.error } : {}),
    });
  },
);

/**
 * GET /cloudflare/logs/pr/:owner/:repo/:pr
 * Lists all check runs for a PR's HEAD commit, so the caller (or the
 * JulesOverseer) can identify which Workers Build check failed.
 */
router.openapi(
  createRoute({
    method: 'get',
    path: '/logs/pr/{owner}/{repo}/{pr}',
    tags: ['CI / Logs'],
    summary: 'List GitHub check runs for a pull request',
    request: { params: PRCheckRunsParams },
    responses: {
      200: {
        description: 'Check runs for the PR HEAD commit.',
        content: { 'application/json': { schema: PRCheckRunsResponse } },
      },
    },
  }),
  async (c) => {
    const { owner, repo, pr } = c.req.valid('param');
    const { GITHUB_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID } = c.env;
    const [ghToken, cfToken, cfAccountId] = await Promise.all([
      GITHUB_TOKEN.get(),
      CLOUDFLARE_API_TOKEN.get(),
      CLOUDFLARE_ACCOUNT_ID.get(),
    ]);
    const svc = new CILogService({ GITHUB_TOKEN: ghToken, CLOUDFLARE_API_TOKEN: cfToken, CLOUDFLARE_ACCOUNT_ID: cfAccountId });
    const runs = await svc.getCheckRunsForPR(owner, repo, parseInt(pr, 10));
    return c.json(runs);
  },
);

export default router;
