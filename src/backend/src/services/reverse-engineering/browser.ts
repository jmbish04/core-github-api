import { zodToJsonSchema } from 'zod-to-json-schema';
import { AIProvider } from '@/ai/providers';
import { BrowserService } from '@/cloudflare/browser';
import { resolveCfEnv } from '@/cloudflare/env-resolver';
import { SandboxClient } from '@/ai/mcp/tools/sandbox-sdk/client';
import { detectWranglerConfig } from '@/routes/api/frontend/repos/utils';
import type { ReverseEngineeringAuthInput } from '@/lib/schemas/reverse-engineering';
import { fetchRepositoryTree, readRepositoryFiles } from './repository';
import { z } from 'zod';

export interface FrontendAuthFinding {
  required: boolean;
  findings: Array<{
    path: string;
    pattern: string;
    excerpt: string;
  }>;
  suggestedMethod: 'bearer_header' | 'custom_header' | 'basic_auth' | 'cookie' | 'query_param' | 'none';
  suggestedHeaderName?: string;
}

export interface PreviewResolutionResult {
  resolvedPreviewUrl: string | null;
  resolutionPath: Array<{
    stage: 'wrangler-worker' | 'user-front-end-url' | 'sandbox-preview';
    success: boolean;
    detail: string;
    url?: string;
  }>;
}

export interface FrontendCaptureResult {
  resolvedUrl: string;
  screenshotUrls: string[];
  imageId?: string | null;
  contentHtml?: string | null;
  visibleLinks?: Array<{ text?: string; href?: string }>;
  visionDescription?: string;
  visionAnalysis?: z.infer<typeof VisionSchema>;
}

const VisionSchema = z.object({
  description: z.string(),
  components: z.array(z.object({
    type: z.string(),
    label: z.string().optional(),
    description: z.string(),
  })).default([]),
  perceivedFunctionality: z.array(z.string()).default([]),
  userJourney: z.array(z.string()).default([]),
});

const AUTH_PATTERNS: Array<{ pattern: RegExp; label: string; suggestedMethod: FrontendAuthFinding['suggestedMethod']; headerName?: string }> = [
  { pattern: /AGENTIC_WORKER_API_KEY/g, label: 'AGENTIC_WORKER_API_KEY', suggestedMethod: 'custom_header', headerName: 'x-api-key' },
  { pattern: /WORKER_API_KEY/g, label: 'WORKER_API_KEY', suggestedMethod: 'custom_header', headerName: 'x-api-key' },
  { pattern: /Authorization\s*[:=]/g, label: 'Authorization header', suggestedMethod: 'bearer_header', headerName: 'Authorization' },
  { pattern: /x-api-key/gi, label: 'x-api-key header', suggestedMethod: 'custom_header', headerName: 'x-api-key' },
  { pattern: /localStorage\.(getItem|setItem)\([^)]*token/gi, label: 'token localStorage usage', suggestedMethod: 'bearer_header', headerName: 'Authorization' },
  { pattern: /document\.cookie|cookies?/gi, label: 'cookie session usage', suggestedMethod: 'cookie' },
  { pattern: /basic auth|username.*password/gi, label: 'basic auth wording', suggestedMethod: 'basic_auth' },
];

function trimExcerpt(content: string, index: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + 160);
  return content.slice(start, end).replace(/\s+/g, ' ').trim();
}

function applyQueryAuth(url: string, auth?: ReverseEngineeringAuthInput): string {
  if (!auth || auth.type !== 'query_param' || !auth.queryParamName || !auth.queryParamValue) {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.set(auth.queryParamName, auth.queryParamValue);
  return parsed.toString();
}

function buildBrowserRequestAuth(auth?: ReverseEngineeringAuthInput): Record<string, unknown> {
  if (!auth) {
    return {};
  }

  if (auth.type === 'bearer_header' && auth.headerValue) {
    return {
      setExtraHTTPHeaders: {
        Authorization: auth.headerValue.startsWith('Bearer ')
          ? auth.headerValue
          : `Bearer ${auth.headerValue}`,
      },
    };
  }

  if (auth.type === 'custom_header' && auth.headerName && auth.headerValue) {
    return {
      setExtraHTTPHeaders: {
        [auth.headerName]: auth.headerValue,
      },
    };
  }

  if (auth.type === 'basic_auth' && auth.username && auth.password) {
    return {
      authenticate: {
        username: auth.username,
        password: auth.password,
      },
    };
  }

  if (auth.type === 'cookie' && auth.cookies?.length) {
    return {
      cookies: auth.cookies,
    };
  }

  return {};
}

export async function detectFrontendAuthRequirements(
  env: Env,
  input: { owner: string; repo: string; branch?: string },
): Promise<FrontendAuthFinding> {
  const { entries, defaultBranch } = await fetchRepositoryTree(env, input.owner, input.repo, input.branch);
  const branch = input.branch || defaultBranch;
  const candidateFiles = entries
    .filter((entry) => entry.type === 'blob')
    .map((entry) => entry.path)
    .filter(
      (path) =>
        path.startsWith('frontend/') ||
        path.includes('/auth') ||
        path.includes('/login') ||
        path.includes('/session') ||
        path.includes('/api-client') ||
        path.includes('/fetch'),
    )
    .slice(0, 60);

  const sources = await readRepositoryFiles(env, input.owner, input.repo, candidateFiles, branch);
  const findings: FrontendAuthFinding['findings'] = [];
  let suggestedMethod: FrontendAuthFinding['suggestedMethod'] = 'none';
  let suggestedHeaderName: string | undefined;

  for (const source of sources) {
    for (const authPattern of AUTH_PATTERNS) {
      const match = authPattern.pattern.exec(source.content);
      if (match) {
        findings.push({
          path: source.path,
          pattern: authPattern.label,
          excerpt: trimExcerpt(source.content, match.index),
        });
        if (suggestedMethod === 'none') {
          suggestedMethod = authPattern.suggestedMethod;
          suggestedHeaderName = authPattern.headerName;
        }
      }
      authPattern.pattern.lastIndex = 0;
    }
  }

  return {
    required: findings.length > 0,
    findings,
    suggestedMethod,
    suggestedHeaderName,
  };
}

async function createSandboxPreviewUrl(
  env: Env,
  input: {
    snapshotId: string;
    repoUrl: string;
    branch: string;
  },
): Promise<string | null> {
  const sandbox = await SandboxClient.create(env, `reverse-eng-${input.snapshotId}`);

  try {
    await sandbox.gitClone({
      repoUrl: input.repoUrl,
      branch: input.branch,
      targetDir: '/workspace/repo',
    });

    const packageJson = await sandbox.readFile({ path: '/workspace/repo/package.json' });
    const frontendPackageJson = await sandbox.readFile({ path: '/workspace/repo/frontend/package.json' });

    const packageManager = packageJson.success && packageJson.content.includes('pnpm')
      ? 'pnpm'
      : frontendPackageJson.success && frontendPackageJson.content.includes('pnpm')
        ? 'pnpm'
        : 'npm';

    const installCommand = packageManager === 'pnpm'
      ? 'corepack enable && pnpm install'
      : 'npm install';

    if (frontendPackageJson.success) {
      await sandbox.exec({ command: installCommand, cwd: '/workspace/repo/frontend', timeoutMs: 240_000 });
      await sandbox.startProcess(
        packageManager === 'pnpm'
          ? 'pnpm exec astro dev --host 0.0.0.0 --port 4321'
          : 'npm run dev -- --host 0.0.0.0 --port 4321',
        { cwd: '/workspace/repo/frontend' },
      );
    } else {
      await sandbox.exec({ command: installCommand, cwd: '/workspace/repo', timeoutMs: 240_000 });
      await sandbox.startProcess(
        packageManager === 'pnpm'
          ? 'pnpm run dev -- --host 0.0.0.0 --port 4321'
          : 'npm run dev -- --host 0.0.0.0 --port 4321',
        { cwd: '/workspace/repo' },
      );
    }

    const exposed = await sandbox.exposePort(4321, {
      hostname: 'core-github-api.hacolby.workers.dev',
      name: `reverse-eng-${input.snapshotId}`,
    });

    return (exposed as any)?.url || null;
  } catch {
    return null;
  }
}

export async function resolvePreviewUrl(
  env: Env,
  input: {
    snapshotId: string;
    owner: string;
    repo: string;
    branch: string;
    repoUrl: string;
    frontendUrl?: string | null;
    useSandboxPreview?: boolean;
  },
): Promise<PreviewResolutionResult> {
  const steps: PreviewResolutionResult['resolutionPath'] = [];

  const wrangler = await detectWranglerConfig(env, input.owner, input.repo, input.branch);
  const workerName = typeof wrangler?.config?.name === 'string' ? wrangler.config.name.trim() : '';
  if (workerName) {
    const url = `https://${workerName}.hacolby.app`;
    steps.push({
      stage: 'wrangler-worker',
      success: true,
      detail: `Resolved from ${wrangler?.fileName || 'wrangler config'} using worker name ${workerName}.`,
      url,
    });
    return { resolvedPreviewUrl: url, resolutionPath: steps };
  }
  steps.push({
    stage: 'wrangler-worker',
    success: false,
    detail: 'No worker name found in wrangler.jsonc or wrangler.toml.',
  });

  if (input.frontendUrl) {
    steps.push({
      stage: 'user-front-end-url',
      success: true,
      detail: 'Used explicit frontend URL from analyze request.',
      url: input.frontendUrl,
    });
    return { resolvedPreviewUrl: input.frontendUrl, resolutionPath: steps };
  }
  steps.push({
    stage: 'user-front-end-url',
    success: false,
    detail: 'No frontend URL supplied by caller.',
  });

  if (input.useSandboxPreview) {
    const sandboxUrl = await createSandboxPreviewUrl(env, {
      snapshotId: input.snapshotId,
      repoUrl: input.repoUrl,
      branch: input.branch,
    });

    if (sandboxUrl) {
      steps.push({
        stage: 'sandbox-preview',
        success: true,
        detail: 'Booted repo in sandbox and exposed a preview port.',
        url: sandboxUrl,
      });
      return { resolvedPreviewUrl: sandboxUrl, resolutionPath: steps };
    }
  }

  steps.push({
    stage: 'sandbox-preview',
    success: false,
    detail: 'Sandbox preview unavailable or startup failed.',
  });

  return { resolvedPreviewUrl: null, resolutionPath: steps };
}

async function uploadScreenshotToImages(
  env: Env,
  bytes: Uint8Array,
  snapshotId: string,
): Promise<{ imageId: string | null; variants: string[] }> {
  const resolved = await resolveCfEnv(env);
  if (!resolved.CLOUDFLARE_ACCOUNT_ID || !resolved.CLOUDFLARE_WRANGLER_API_TOKEN) {
    return { imageId: null, variants: [] };
  }

  const form = new FormData();
  const normalizedBytes = new Uint8Array(bytes.byteLength);
  normalizedBytes.set(bytes);
  form.append('file', new Blob([normalizedBytes.buffer], { type: 'image/png' }), `${snapshotId}.png`);
  form.append('requireSignedURLs', 'false');
  form.append('metadata', JSON.stringify({ source: 'reverse-engineering', snapshotId }));

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${resolved.CLOUDFLARE_ACCOUNT_ID}/images/v1`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolved.CLOUDFLARE_WRANGLER_API_TOKEN}`,
      },
      body: form,
    },
  );

  if (!response.ok) {
    return { imageId: null, variants: [] };
  }

  const payload = (await response.json()) as {
    result?: {
      id?: string;
      variants?: string[];
    };
  };

  return {
    imageId: payload.result?.id || null,
    variants: payload.result?.variants || [],
  };
}

async function describeScreenshotWithVision(
  env: Env,
  bytes: Uint8Array,
  url: string,
) {
  const promptMsg = `Describe the page shown in this screenshot from ${url}. Focus on layout, visible components, perceived functionality, and likely user journey.\n\nPlease structure your thought process keeping the following JSON schema in mind:\n${JSON.stringify(zodToJsonSchema(VisionSchema as any, 'vision_schema'), null, 2)}`;

  const response = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
    image: [...bytes],
    prompt: promptMsg,
    max_tokens: 768,
  } as any);

  const description = typeof response === 'string'
    ? response
    : typeof (response as any)?.description === 'string'
      ? (response as any).description
      : JSON.stringify(response);

  const ai = new AIProvider(env);
  return ai.generateStructuredResponse<z.infer<typeof VisionSchema>>(
    description,
    VisionSchema,
    'You normalize screenshot descriptions into structured JSON. Preserve only visible, evidence-based claims.',
    { provider: 'worker-ai', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' }
  );
}

export async function captureFrontendEvidence(
  env: Env,
  input: {
    snapshotId: string;
    url: string;
    auth?: ReverseEngineeringAuthInput;
  },
): Promise<FrontendCaptureResult> {
  const browser = new BrowserService(env);
  const requestAuth = buildBrowserRequestAuth(input.auth);
  const resolvedUrl = applyQueryAuth(input.url, input.auth);

  const screenshotResponse = (await browser.getScreenshot({
    url: resolvedUrl,
    viewport: { width: 1440, height: 1080 },
    gotoOptions: { waitUntil: 'networkidle2', timeout: 45000 },
    screenshotOptions: { fullPage: true, type: 'png' },
    ...requestAuth,
  } as any)) as Response;

  const screenshotBytes = new Uint8Array(await screenshotResponse.arrayBuffer());
  const imageUpload = await uploadScreenshotToImages(env, screenshotBytes, input.snapshotId);

  const contentResponse = await browser.getContent({
    url: resolvedUrl,
    ...requestAuth,
  } as any);

  const linksResponse = await browser.getLinks({
    url: resolvedUrl,
    visibleLinksOnly: true,
    gotoOptions: { waitUntil: 'networkidle2', timeout: 45000 },
    ...requestAuth,
  } as any).catch(() => ({ links: [] }));

  const vision = await describeScreenshotWithVision(env, screenshotBytes, resolvedUrl);

  return {
    resolvedUrl,
    screenshotUrls: imageUpload.variants,
    imageId: imageUpload.imageId,
    contentHtml: typeof (contentResponse as any)?.result === 'string'
      ? (contentResponse as any).result
      : typeof (contentResponse as any)?.content === 'string'
        ? (contentResponse as any).content
        : JSON.stringify(contentResponse),
    visibleLinks: Array.isArray((linksResponse as any)?.result?.links)
      ? (linksResponse as any).result.links
      : Array.isArray((linksResponse as any)?.links)
        ? (linksResponse as any).links
        : [],
    visionDescription: vision.description,
    visionAnalysis: vision,
  };
}
