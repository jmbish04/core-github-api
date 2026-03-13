import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { generateStructuredResponse } from '@/ai/providers';
import { withFullCodeOutputRules } from '@/ai/utils/code-output-rules';
import type { ReverseEngineeringAuthInput } from '@/lib/schemas/reverse-engineering';
import { JulesService } from '@/services/jules/service';
import {
  broadcastReverseEngineeringEvent,
  type ReverseEngineeringMonitorEvent,
} from './monitor';
import {
  captureFrontendEvidence,
  detectFrontendAuthRequirements,
  resolvePreviewUrl,
  type FrontendCaptureResult,
} from './browser';
import {
  performInitialRepoResearch,
  type FrontendRouteInventoryItem,
  type RepositoryResearchSummary,
} from './repository';
import {
  getReverseEngineeringSnapshot,
  markReverseEngineeringFailed,
  updateReverseEngineeringSnapshot,
  upsertReverseEngineeringBackend,
  upsertReverseEngineeringUx,
} from './store';

export interface ReverseEngineeringRunInput {
  snapshotId: string;
  projectId?: string | null;
  owner: string;
  repo: string;
  repoUrl: string;
  branch: string;
  frontendUrl?: string | null;
  auth?: ReverseEngineeringAuthInput;
  useSandboxPreview?: boolean;
  title?: string;
}

const FrontendPageCodeAnalysisSchema = z.object({
  route: z.string(),
  filePath: z.string().optional(),
  codeDescription: z.string(),
  components: z.array(z.object({
    type: z.string(),
    label: z.string().optional(),
    description: z.string(),
  })).default([]),
  userJourney: z.array(z.string()).default([]),
});

const FrontendCodeResearchSchema = z.object({
  overallSummary: z.string(),
  pages: z.array(FrontendPageCodeAnalysisSchema).default([]),
  uxRisks: z.array(z.string()).default([]),
});

const BackendResearchSchema = z.object({
  architectureMarkdown: z.string(),
  authModel: z.object({
    summary: z.string(),
    providers: z.array(z.string()).default([]),
    protectedAreas: z.array(z.string()).default([]),
  }),
  deploymentModel: z.object({
    workerName: z.string().nullable().optional(),
    wranglerFile: z.string().nullable().optional(),
    runtime: z.string().optional(),
    frontendHosting: z.string().optional(),
    bindings: z.array(z.string()).default([]),
  }),
  dataModel: z.object({
    entities: z.array(z.object({
      name: z.string(),
      description: z.string(),
      fields: z.array(z.string()).default([]),
    })).default([]),
    relationships: z.array(z.string()).default([]),
  }),
  integrations: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })).default([]),
});

const ProductResearchSchema = z.object({
  executiveSummary: z.string(),
  problemStatement: z.string(),
  primaryUsers: z.array(z.string()).default([]),
  candidateEpics: z.array(z.object({
    title: z.string(),
    description: z.string(),
    userStories: z.array(z.object({
      title: z.string(),
      description: z.string(),
      acceptanceCriteria: z.array(z.string()).default([]),
    })).default([]),
  })).default([]),
  likelyJourneys: z.array(z.object({
    name: z.string(),
    actor: z.string(),
    steps: z.array(z.string()).default([]),
    outcome: z.string().optional(),
  })).default([]),
});

const SynthesizedPageSchema = z.object({
  route: z.string(),
  filePath: z.string().optional(),
  title: z.string(),
  description: z.string(),
  codeAnalysis: z.string(),
  visionAnalysis: z.string(),
  components: z.array(z.object({
    type: z.string(),
    label: z.string().optional(),
    description: z.string(),
  })).default([]),
  perceivedFunctionality: z.array(z.string()).default([]),
  userJourney: z.array(z.string()).default([]),
});

const FinalEpicSchema = z.object({
  title: z.string(),
  description: z.string(),
  userStories: z.array(z.object({
    title: z.string(),
    description: z.string(),
    acceptanceCriteria: z.array(z.string()).default([]),
  })).default([]),
});

const FinalJourneySchema = z.object({
  name: z.string(),
  actor: z.string(),
  steps: z.array(z.string()).default([]),
  outcome: z.string().optional(),
});

const FinalReverseEngineeringSchema = z.object({
  executiveSummary: z.string(),
  prdMarkdown: z.string(),
  epics: z.array(FinalEpicSchema).default([]),
  userJourneys: z.array(FinalJourneySchema).default([]),
  ux: z.object({
    overallDescription: z.string(),
    pageAnalyses: z.array(SynthesizedPageSchema).default([]),
  }),
  backend: BackendResearchSchema,
});

type FrontendCodeResearch = z.infer<typeof FrontendCodeResearchSchema>;
type BackendResearch = z.infer<typeof BackendResearchSchema>;
type ProductResearch = z.infer<typeof ProductResearchSchema>;
type SynthesizedPage = z.infer<typeof SynthesizedPageSchema>;
type FinalReverseEngineering = z.infer<typeof FinalReverseEngineeringSchema>;

interface ResearchPromptSpec {
  key: 'frontend' | 'backend' | 'product';
  title: string;
  prompt: string;
  fileName: string;
  sessionId: string;
}

interface JulesCollectedOutcome {
  sessionId: string;
  state: string;
  lastAgentMessage: string | null;
  generatedFiles: Array<{ path: string; content: string }>;
  rawResult: any;
}

function routeWeight(route: string): number {
  if (route === '/') return 0;
  if (route.includes(':') || route.includes('[') || route.includes('*')) return 100;
  return route.split('/').filter(Boolean).length;
}

function buildScreenshotTargets(
  summary: RepositoryResearchSummary,
  resolvedPreviewUrl: string,
): Array<{ route: string; filePath?: string; targetUrl: string }> {
  const seen = new Set<string>();
  const candidates = [...summary.frontend.routes]
    .sort((a, b) => routeWeight(a.route) - routeWeight(b.route))
    .slice(0, 12);

  const normalizedTargets = [
    {
      route: '/',
      filePath: candidates.find((candidate) => candidate.route === '/')?.filePath,
      targetUrl: new URL('/', resolvedPreviewUrl).toString(),
    },
    ...candidates.map((candidate) => ({
      route: candidate.route,
      filePath: candidate.filePath,
      targetUrl: new URL(candidate.route, resolvedPreviewUrl).toString(),
    })),
  ];

  return normalizedTargets
    .filter((candidate) => {
      if (!candidate.targetUrl || seen.has(candidate.route)) return false;
      seen.add(candidate.route);
      return true;
    })
    .slice(0, 6);
}

function pickGeneratedFile(
  outcome: JulesCollectedOutcome,
  predicate: (path: string) => boolean,
): string | null {
  const found = outcome.generatedFiles.find((file) => predicate(file.path));
  return found?.content || null;
}

function safeParseJson<T>(
  content: string | null,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: unknown } },
): T | null {
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content);
    const validated = schema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function summarizeGeneratedFiles(outcome: JulesCollectedOutcome) {
  return outcome.generatedFiles.map((file) => file.path);
}

function buildFrontendPrompt(summary: RepositoryResearchSummary): string {
  const routes = summary.frontend.routes
    .slice(0, 16)
    .map((route) => `- ${route.route} (${route.filePath})`)
    .join('\n');

  return [
    'You are analyzing a repository frontend in detail.',
    'Study only the frontend user experience, route structure, and visible UI behavior implied by the code.',
    'Return exactly one file named `frontend-code-analysis.json`.',
    'Do not return prose outside the file.',
    'The JSON file MUST match this schema:',
    JSON.stringify(zodToJsonSchema(FrontendCodeResearchSchema as any, 'frontend_code_research'), null, 2),
    '',
    'Repository research context:',
    summary.summaryMarkdown,
    '',
    'Candidate frontend routes:',
    routes || '- none detected',
  ].join('\n');
}

function buildBackendPrompt(summary: RepositoryResearchSummary): string {
  const endpoints = summary.backend.endpoints
    .slice(0, 40)
    .map((endpoint) => `- ${endpoint.method} ${endpoint.path} (${endpoint.filePath})`)
    .join('\n');

  return [
    'Analyze the backend and infrastructure architecture of this repository.',
    'Return exactly one file named `backend-architecture-analysis.json`.',
    'Do not return prose outside the file.',
    'The JSON file MUST match this schema:',
    JSON.stringify(zodToJsonSchema(BackendResearchSchema as any, 'backend_research'), null, 2),
    '',
    'Repository research context:',
    summary.summaryMarkdown,
    '',
    'Known API routes:',
    endpoints || '- none detected',
  ].join('\n');
}

function buildProductPrompt(summary: RepositoryResearchSummary): string {
  return [
    'Analyze this repository as a product and user workflow artifact.',
    'Infer the product intent, primary users, likely user journeys, and candidate epic groupings from the codebase.',
    'Return exactly one file named `product-analysis.json`.',
    'Do not return prose outside the file.',
    'The JSON file MUST match this schema:',
    JSON.stringify(zodToJsonSchema(ProductResearchSchema as any, 'product_research'), null, 2),
    '',
    'Repository research context:',
    summary.summaryMarkdown,
  ].join('\n');
}

function buildParallelPromptSpecs(input: ReverseEngineeringRunInput, summary: RepositoryResearchSummary): ResearchPromptSpec[] {
  const specs: ResearchPromptSpec[] = [];

  if (summary.frontend.present) {
    specs.push({
      key: 'frontend',
      title: 'Frontend UX code analysis',
      prompt: buildFrontendPrompt(summary),
      fileName: 'frontend-code-analysis.json',
      sessionId: `${input.snapshotId}-frontend`,
    });
  }

  if (summary.backend.present) {
    specs.push({
      key: 'backend',
      title: 'Backend architecture analysis',
      prompt: buildBackendPrompt(summary),
      fileName: 'backend-architecture-analysis.json',
      sessionId: `${input.snapshotId}-backend`,
    });
  }

  specs.push({
    key: 'product',
    title: 'Product and epic inference',
    prompt: buildProductPrompt(summary),
    fileName: 'product-analysis.json',
    sessionId: `${input.snapshotId}-product`,
  });

  return specs;
}

async function collectParallelResearch(
  env: Env,
  input: ReverseEngineeringRunInput,
  specs: ResearchPromptSpec[],
): Promise<Record<ResearchPromptSpec['key'], JulesCollectedOutcome | null>> {
  const jules = JulesService.getInstance(env);
  const sessions = await jules.startParallelSessions(
    specs.map((spec) => ({
      sessionId: spec.sessionId,
      prompt: spec.prompt,
      repo: {
        owner: input.owner,
        repo: input.repo,
        branch: input.branch,
      },
      projectId: input.projectId || undefined,
      sessionRole: `reverse-engineering:${spec.key}`,
      autoPr: false,
      requireApproval: false,
    })),
  );

  const results = await Promise.all(
    sessions.map(async (session: any, index: number) => {
      const spec = specs[index]!;
      await broadcastReverseEngineeringEvent(env, input.snapshotId, {
        type: 'JULES_PARALLEL_STARTED',
        status: 'running',
        title: spec.title,
        message: `Started Jules session ${session.id || spec.sessionId}.`,
        data: { sessionId: session.id || spec.sessionId, key: spec.key },
      });

      const outcome = await jules.collectSessionOutcome(session);
      await broadcastReverseEngineeringEvent(env, input.snapshotId, {
        type: 'JULES_PARALLEL_RESULT',
        status: outcome.state === 'failed' ? 'failed' : 'running',
        title: spec.title,
        message: `Completed with state ${outcome.state}. Generated files: ${summarizeGeneratedFiles(outcome).join(', ') || 'none'}.`,
        data: {
          key: spec.key,
          sessionId: outcome.sessionId,
          state: outcome.state,
          generatedFiles: summarizeGeneratedFiles(outcome),
        },
      });
      return { spec, outcome };
    }),
  );

  const mapped: Record<ResearchPromptSpec['key'], JulesCollectedOutcome | null> = {
    frontend: null,
    backend: null,
    product: null,
  };

  for (const result of results) {
    mapped[result.spec.key] = result.outcome;
  }

  return mapped;
}

async function synthesizePageUx(
  env: Env,
  input: {
    route: string;
    filePath?: string;
    codeAnalysis?: FrontendCodeResearch['pages'][number] | null;
    capture?: FrontendCaptureResult | null;
  },
): Promise<SynthesizedPage> {
  const prompt = [
    'Synthesize one final UI route description using BOTH code analysis and screenshot vision analysis.',
    'Preserve only evidence-backed claims.',
    '',
    'Route:',
    input.route,
    '',
    'Frontend code analysis:',
    JSON.stringify(input.codeAnalysis || null, null, 2),
    '',
    'Vision screenshot analysis:',
    JSON.stringify(input.capture?.visionAnalysis || null, null, 2),
    '',
    'Visible links:',
    JSON.stringify(input.capture?.visibleLinks || [], null, 2),
  ].join('\n');

  return generateStructuredResponse<SynthesizedPage>(
    env,
    prompt,
    zodToJsonSchema(SynthesizedPageSchema as any, 'synthesized_page') as object,
    'Combine route-level code analysis and screenshot vision analysis into one final UX description.',
  );
}

async function synthesizeOverallUx(
  env: Env,
  pages: SynthesizedPage[],
): Promise<string> {
  const OverallUxSchema = z.object({
    overallDescription: z.string(),
  });

  const result = await generateStructuredResponse<z.infer<typeof OverallUxSchema>>(
    env,
    [
      'Summarize the overall user experience of this application using the provided route analyses.',
      JSON.stringify(pages, null, 2),
    ].join('\n\n'),
    zodToJsonSchema(OverallUxSchema as any, 'overall_ux_summary') as object,
    'Write a concise but specific application UX overview.',
  );

  return result.overallDescription;
}

function buildFinalSynthesisPrompt(input: {
  summary: RepositoryResearchSummary;
  screenshotCaptures: Array<{ route: string; filePath?: string; capture: FrontendCaptureResult }>;
  synthesizedPages: SynthesizedPage[];
  frontendResearch: FrontendCodeResearch | null;
  backendResearch: BackendResearch | null;
  productResearch: ProductResearch | null;
}) {
  return withFullCodeOutputRules([
    'Produce the final reverse-engineering deliverables for this repository.',
    'You MUST generate exactly two files:',
    '1. `overall-prd.md`',
    '2. `reverse-engineering.json`',
    '',
    '`reverse-engineering.json` MUST match this schema exactly:',
    JSON.stringify(zodToJsonSchema(FinalReverseEngineeringSchema as any, 'final_reverse_engineering'), null, 2),
    '',
    'Use the following context:',
    '1. Initial repository research',
    input.summary.summaryMarkdown,
    '',
    '2. Screenshot captures and vision analysis',
    JSON.stringify(input.screenshotCaptures, null, 2),
    '',
    '3. Synthesized page UX analyses (combined code + vision)',
    JSON.stringify(input.synthesizedPages, null, 2),
    '',
    '4. Parallel frontend research',
    JSON.stringify(input.frontendResearch, null, 2),
    '',
    '5. Parallel backend research',
    JSON.stringify(input.backendResearch, null, 2),
    '',
    '6. Parallel product research',
    JSON.stringify(input.productResearch, null, 2),
    '',
    'The final PRD markdown must be comprehensive and implementation-ready.',
    'The epics must group user stories logically.',
    'The user journeys must describe end-to-end UX flows.',
  ].join('\n'));
}

async function runFinalSynthesis(
  env: Env,
  input: ReverseEngineeringRunInput,
  summary: RepositoryResearchSummary,
  screenshotCaptures: Array<{ route: string; filePath?: string; capture: FrontendCaptureResult }>,
  synthesizedPages: SynthesizedPage[],
  frontendResearch: FrontendCodeResearch | null,
  backendResearch: BackendResearch | null,
  productResearch: ProductResearch | null,
): Promise<{
  sessionId: string;
  prdMarkdown: string;
  structured: FinalReverseEngineering;
  outcome: JulesCollectedOutcome;
}> {
  const jules = JulesService.getInstance(env);
  const prompt = buildFinalSynthesisPrompt({
    summary,
    screenshotCaptures,
    synthesizedPages,
    frontendResearch,
    backendResearch,
    productResearch,
  });

  const session = await jules.startSession({
    sessionId: `${input.snapshotId}-final`,
    prompt,
    projectId: input.projectId || undefined,
    sessionRole: 'reverse-engineering:final',
    autoPr: false,
    requireApproval: false,
  });

  await broadcastReverseEngineeringEvent(env, input.snapshotId, {
    type: 'FINAL_SYNTHESIS',
    status: 'running',
    title: 'Final Jules synthesis started',
    message: `Started final synthesis session ${session.id || `${input.snapshotId}-final`}.`,
  });

  const outcome = await jules.collectSessionOutcome(session);
  const generatedMarkdown =
    pickGeneratedFile(outcome, (path) => path.endsWith('overall-prd.md')) ||
    outcome.lastAgentMessage ||
    '';
  const generatedJson =
    safeParseJson(
      pickGeneratedFile(outcome, (path) => path.endsWith('reverse-engineering.json')),
      FinalReverseEngineeringSchema,
    );

  if (generatedMarkdown && generatedJson) {
    return {
      sessionId: outcome.sessionId,
      prdMarkdown: generatedMarkdown,
      structured: generatedJson,
      outcome,
    };
  }

  const fallback = await generateStructuredResponse<FinalReverseEngineering>(
    env,
    [
      'Normalize the final reverse-engineering deliverables from this Jules output.',
      'If the PRD markdown is missing, construct it from the available synthesis context.',
      '',
      'Jules last agent message:',
      outcome.lastAgentMessage || '(none)',
      '',
      'Generated markdown:',
      generatedMarkdown || '(none)',
      '',
      'Repository research summary:',
      summary.summaryMarkdown,
      '',
      'Synthesized pages:',
      JSON.stringify(synthesizedPages, null, 2),
      '',
      'Backend research:',
      JSON.stringify(backendResearch, null, 2),
      '',
      'Product research:',
      JSON.stringify(productResearch, null, 2),
    ].join('\n'),
    zodToJsonSchema(FinalReverseEngineeringSchema as any, 'final_reverse_engineering_fallback') as object,
    'Return the final reverse-engineering JSON structure exactly.',
  );

  return {
    sessionId: outcome.sessionId,
    prdMarkdown: generatedMarkdown || fallback.prdMarkdown,
    structured: fallback,
    outcome,
  };
}

function extractRepoStateForSnapshot(summary: RepositoryResearchSummary) {
  return {
    stack: summary.stack,
    treeSummary: summary.treeSummary,
    frontend: summary.frontend,
    backend: summary.backend,
    integrations: summary.integrations,
    filesReviewed: summary.filesReviewed,
    dependencySummary: summary.dependencySummary,
  };
}

function buildScreenshotGallery(
  screenshotCaptures: Array<{ route: string; filePath?: string; capture: FrontendCaptureResult }>,
) {
  return screenshotCaptures.map(({ route, filePath, capture }) => ({
    route,
    filePath: filePath || null,
    resolvedUrl: capture.resolvedUrl,
    imageId: capture.imageId || null,
    screenshotUrls: capture.screenshotUrls,
    visionDescription: capture.visionDescription || null,
  }));
}

async function updateSnapshotComplete(
  env: Env,
  snapshotId: string,
  input: {
    summary: RepositoryResearchSummary;
    previewResolution: unknown;
    authFinding: unknown;
    screenshotCaptures: Array<{ route: string; filePath?: string; capture: FrontendCaptureResult }>;
    synthesizedPages: SynthesizedPage[];
    finalSynthesis: FinalReverseEngineering;
    finalOutcome: JulesCollectedOutcome;
    prdMarkdown: string;
    parallelResearch: Record<string, unknown>;
  },
) {
  await updateReverseEngineeringSnapshot(env, snapshotId, {
    status: 'complete',
    completedAt: new Date().toISOString(),
    detectedStackJson: JSON.stringify(input.summary.stack),
    previewResolutionJson: JSON.stringify(input.previewResolution),
    frontendAuthJson: JSON.stringify(input.authFinding),
    screenshotUrlsJson: JSON.stringify(
      input.screenshotCaptures.flatMap((entry) => entry.capture.screenshotUrls || []),
    ),
    prdMarkdown: input.prdMarkdown,
    epicsJson: JSON.stringify(input.finalSynthesis.epics),
    userJourneysJson: JSON.stringify(input.finalSynthesis.userJourneys),
    repoResearchJson: JSON.stringify(extractRepoStateForSnapshot(input.summary)),
    julesResearchJson: JSON.stringify({
      parallelResearch: input.parallelResearch,
      finalSession: {
        sessionId: input.finalOutcome.sessionId,
        state: input.finalOutcome.state,
        generatedFiles: summarizeGeneratedFiles(input.finalOutcome),
      },
    }),
    errorMessage: null,
  });

  await upsertReverseEngineeringUx(env, snapshotId, {
    overallDescription: input.finalSynthesis.ux.overallDescription,
    pageAnalysesJson: JSON.stringify(input.synthesizedPages),
    screenshotGalleryJson: JSON.stringify(buildScreenshotGallery(input.screenshotCaptures)),
    pageUserJourneysJson: JSON.stringify(input.finalSynthesis.userJourneys),
    visionAnalysisJson: JSON.stringify(
      input.screenshotCaptures.map((entry) => ({
        route: entry.route,
        vision: entry.capture.visionAnalysis || null,
      })),
    ),
    codeAnalysisJson: JSON.stringify(input.parallelResearch.frontend || null),
  });

  await upsertReverseEngineeringBackend(env, snapshotId, {
    architectureMarkdown: input.finalSynthesis.backend.architectureMarkdown,
    endpointInventoryJson: JSON.stringify(input.summary.backend.endpoints),
    dataModelJson: JSON.stringify(input.finalSynthesis.backend.dataModel),
    integrationsJson: JSON.stringify(input.finalSynthesis.backend.integrations),
    authModelJson: JSON.stringify(input.finalSynthesis.backend.authModel),
    deploymentModelJson: JSON.stringify(input.finalSynthesis.backend.deploymentModel),
  });
}

async function captureFrontendScreens(
  env: Env,
  input: ReverseEngineeringRunInput,
  summary: RepositoryResearchSummary,
  resolvedPreviewUrl: string,
): Promise<Array<{ route: string; filePath?: string; capture: FrontendCaptureResult }>> {
  const targets = buildScreenshotTargets(summary, resolvedPreviewUrl);
  const results: Array<{ route: string; filePath?: string; capture: FrontendCaptureResult }> = [];

  for (const target of targets) {
    try {
      const capture = await captureFrontendEvidence(env, {
        snapshotId: `${input.snapshotId}-${target.route.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'root'}`,
        url: target.targetUrl,
        auth: input.auth,
      });
      results.push({
        route: target.route,
        filePath: target.filePath,
        capture,
      });

      await broadcastReverseEngineeringEvent(env, input.snapshotId, {
        type: 'SCREENSHOT_CAPTURED',
        status: 'running',
        title: `Captured ${target.route}`,
        message: `Captured screenshot and content for ${target.targetUrl}.`,
        data: {
          route: target.route,
          targetUrl: target.targetUrl,
          screenshotUrls: capture.screenshotUrls,
        },
      });

      await broadcastReverseEngineeringEvent(env, input.snapshotId, {
        type: 'VISION_ANALYZED',
        status: 'running',
        title: `Vision analysis for ${target.route}`,
        message: capture.visionDescription,
        data: capture.visionAnalysis || null,
      });
    } catch (error) {
      await broadcastReverseEngineeringEvent(env, input.snapshotId, {
        type: 'ERROR',
        status: 'running',
        title: `Frontend capture failed for ${target.route}`,
        message: error instanceof Error ? error.message : 'Unknown browser rendering error',
      });
    }
  }

  return results;
}

function matchCodeAnalysisForRoute(
  route: string,
  pages: FrontendCodeResearch['pages'],
): FrontendCodeResearch['pages'][number] | null {
  const normalized = route.replace(/\/+$/, '') || '/';
  return (
    pages.find((page) => (page.route.replace(/\/+$/, '') || '/') === normalized) ||
    pages.find((page) => normalized.startsWith(page.route.replace(/\/+$/, '') || '/')) ||
    null
  );
}

function buildParallelResearchSummary(
  specs: ResearchPromptSpec[],
  results: Record<ResearchPromptSpec['key'], JulesCollectedOutcome | null>,
) {
  return specs.map((spec) => {
    const outcome = results[spec.key];
    return {
      key: spec.key,
      title: spec.title,
      sessionId: outcome?.sessionId || spec.sessionId,
      state: outcome?.state || 'unknown',
      generatedFiles: outcome ? summarizeGeneratedFiles(outcome) : [],
      lastAgentMessage: outcome?.lastAgentMessage || null,
    };
  });
}

function coerceParsedResearch<T>(
  outcome: JulesCollectedOutcome | null,
  fileName: string,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: unknown } },
): T | null {
  if (!outcome) {
    return null;
  }
  return safeParseJson(
    pickGeneratedFile(outcome, (path) => path.endsWith(fileName)),
    schema,
  );
}

export async function runReverseEngineeringAnalysis(
  env: Env,
  input: ReverseEngineeringRunInput,
) {
  await updateReverseEngineeringSnapshot(env, input.snapshotId, {
    status: 'running',
    errorMessage: null,
    requestedAuthJson: JSON.stringify(input.auth || null),
  });

  await broadcastReverseEngineeringEvent(env, input.snapshotId, {
    type: 'STATUS',
    status: 'running',
    title: 'Reverse engineering started',
    message: `Analyzing ${input.owner}/${input.repo} on ${input.branch}.`,
  });

  try {
    const summary = await performInitialRepoResearch(env, {
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
      repoUrl: input.repoUrl,
    });
    await updateReverseEngineeringSnapshot(env, input.snapshotId, {
      detectedStackJson: JSON.stringify(summary.stack),
      repoResearchJson: JSON.stringify(extractRepoStateForSnapshot(summary)),
    });

    await broadcastReverseEngineeringEvent(env, input.snapshotId, {
      type: 'REPO_RESEARCH',
      status: 'running',
      title: 'Initial repository research completed',
      message: summary.summaryMarkdown,
      data: extractRepoStateForSnapshot(summary),
    });

    const frontendAuth = await detectFrontendAuthRequirements(env, {
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
    });
    await updateReverseEngineeringSnapshot(env, input.snapshotId, {
      frontendAuthJson: JSON.stringify(frontendAuth),
    });

    if (frontendAuth.required && !input.auth) {
      await updateReverseEngineeringSnapshot(env, input.snapshotId, {
        status: 'awaiting_auth',
        errorMessage: 'Frontend authentication is required before screenshots can be captured.',
      });
      await broadcastReverseEngineeringEvent(env, input.snapshotId, {
        type: 'AUTH_REQUIRED',
        status: 'awaiting_auth',
        title: 'Frontend authentication required',
        message: 'The frontend appears to require authentication. Provide the auth method before screenshot capture can continue.',
        data: frontendAuth,
      });
      return getReverseEngineeringSnapshot(env, input.snapshotId);
    }

    const previewResolution = await resolvePreviewUrl(env, {
      snapshotId: input.snapshotId,
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
      repoUrl: input.repoUrl,
      frontendUrl: input.frontendUrl || undefined,
      useSandboxPreview: input.useSandboxPreview ?? true,
    });

    await updateReverseEngineeringSnapshot(env, input.snapshotId, {
      resolvedPreviewUrl: previewResolution.resolvedPreviewUrl,
      previewResolutionJson: JSON.stringify(previewResolution),
    });

    await broadcastReverseEngineeringEvent(env, input.snapshotId, {
      type: 'URL_RESOLVED',
      status: 'running',
      title: 'Resolved preview URL',
      message: previewResolution.resolvedPreviewUrl || 'No preview URL available.',
      data: previewResolution,
    });

    const screenshotCaptures =
      summary.frontend.present && previewResolution.resolvedPreviewUrl
        ? await captureFrontendScreens(env, input, summary, previewResolution.resolvedPreviewUrl)
        : [];

    const promptSpecs = buildParallelPromptSpecs(input, summary);
    const parallelResults = await collectParallelResearch(env, input, promptSpecs);
    const frontendResearch = coerceParsedResearch(
      parallelResults.frontend,
      'frontend-code-analysis.json',
      FrontendCodeResearchSchema,
    );
    const backendResearch = coerceParsedResearch(
      parallelResults.backend,
      'backend-architecture-analysis.json',
      BackendResearchSchema,
    );
    const productResearch = coerceParsedResearch(
      parallelResults.product,
      'product-analysis.json',
      ProductResearchSchema,
    );

    const synthesizedPages = await Promise.all(
      screenshotCaptures.map(async (entry) =>
        synthesizePageUx(env, {
          route: entry.route,
          filePath: entry.filePath,
          codeAnalysis: matchCodeAnalysisForRoute(entry.route, frontendResearch?.pages || []),
          capture: entry.capture,
        }),
      ),
    );

    const overallUxDescription = synthesizedPages.length
      ? await synthesizeOverallUx(env, synthesizedPages)
      : frontendResearch?.overallSummary || 'No frontend UX surface was detected for screenshot synthesis.';

    const final = await runFinalSynthesis(
      env,
      input,
      summary,
      screenshotCaptures,
      synthesizedPages,
      frontendResearch,
      backendResearch,
      productResearch,
    );

    const finalStructured: FinalReverseEngineering = {
      ...final.structured,
      ux: {
        overallDescription: final.structured.ux.overallDescription || overallUxDescription,
        pageAnalyses: final.structured.ux.pageAnalyses.length > 0
          ? final.structured.ux.pageAnalyses
          : synthesizedPages,
      },
      backend: final.structured.backend,
    };

    const parallelResearchSummary = buildParallelResearchSummary(promptSpecs, parallelResults);

    await updateSnapshotComplete(env, input.snapshotId, {
      summary,
      previewResolution,
      authFinding: frontendAuth,
      screenshotCaptures,
      synthesizedPages: finalStructured.ux.pageAnalyses,
      finalSynthesis: finalStructured,
      finalOutcome: final.outcome,
      prdMarkdown: final.prdMarkdown,
      parallelResearch: {
        summary: parallelResearchSummary,
        frontend: frontendResearch,
        backend: backendResearch,
        product: productResearch,
      },
    });

    await broadcastReverseEngineeringEvent(env, input.snapshotId, {
      type: 'COMPLETE',
      status: 'complete',
      title: 'Reverse engineering complete',
      message: 'Snapshot analysis, UX synthesis, backend architecture, PRD, epics, and user journeys are ready.',
      data: {
        snapshotId: input.snapshotId,
        synthesizedPages: finalStructured.ux.pageAnalyses.length,
        epics: finalStructured.epics.length,
        journeys: finalStructured.userJourneys.length,
      },
    });

    return getReverseEngineeringSnapshot(env, input.snapshotId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown reverse-engineering failure';
    await markReverseEngineeringFailed(env, input.snapshotId, message);
    await broadcastReverseEngineeringEvent(env, input.snapshotId, {
      type: 'ERROR',
      status: 'failed',
      title: 'Reverse engineering failed',
      message,
    });
    throw error;
  }
}

export async function resumeReverseEngineeringAnalysis(
  env: Env,
  input: {
    snapshotId: string;
    auth: ReverseEngineeringAuthInput;
    frontendUrl?: string | null;
  },
) {
  const snapshot = await getReverseEngineeringSnapshot(env, input.snapshotId);
  if (!snapshot) {
    throw new Error(`Snapshot ${input.snapshotId} not found`);
  }

  return runReverseEngineeringAnalysis(env, {
    snapshotId: input.snapshotId,
    projectId: snapshot.projectId || null,
    owner: snapshot.githubOwner,
    repo: snapshot.githubRepo,
    repoUrl: snapshot.repoUrl,
    branch: snapshot.branch,
    frontendUrl: input.frontendUrl || snapshot.frontendUrl,
    auth: input.auth,
    useSandboxPreview: true,
    title: snapshot.title || undefined,
  });
}
