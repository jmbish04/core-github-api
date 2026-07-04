export type ResearchDispatchMode = 'research-targeted' | 'research-keywords';

export type ResearchWorkflowEventType =
  | 'health'
  | 'research-targeted'
  | 'research-keywords'
  | 'research-dispatcher-start'
  | 'research-health-check'
  | 'research-task'
  | 'research-keyword';

type ResearchDispatchPayload = {
  event_type: ResearchWorkflowEventType;
  client_payload: Record<string, unknown>;
};

export type ResearchWorkflowDispatchPlan = {
  mode: ResearchDispatchMode;
  payload: ResearchDispatchPayload;
  targetedRepos: string[];
  keywordTerms: string[];
};

export type BuildResearchDispatchPlanInput = {
  callbackUrl: string;
  githubTerms?: string[] | null;
  googleTerms?: string[] | null;
  goal?: string | null;
  projectId: string;
  taskId?: string;
  maxWorkerRepos?: number;
};

export type NormalizedResearchWorkflowCallback = {
  event: ResearchWorkflowEventType;
  mode: 'health' | ResearchDispatchMode;
  orchestratorPath: string;
  path: string;
  projectId: string;
  resultsFile?: string;
  status: string;
  taskId: string;
  clonedRepos: number;
  discoveredRepos: number;
  newDiscoveredRepos: number;
};

const LEGACY_HEALTH_EVENTS = new Set<ResearchWorkflowEventType>(['health', 'research-health-check']);
const LEGACY_KEYWORD_EVENTS = new Set<ResearchWorkflowEventType>(['research-keywords', 'research-keyword']);
const LEGACY_TARGETED_EVENTS = new Set<ResearchWorkflowEventType>(['research-targeted', 'research-task']);
const TARGETED_RESULTS_FILE = 'targeted-repo-research-results.json';
const KEYWORD_RESULTS_FILE = 'cloudflare-worker-search-results.json';

const GITHUB_REPO_PATTERN =
  /^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i;

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }

    if (seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function normalizeGitHubRepoTarget(value: string): string | null {
  const trimmed = value.trim();
  const match = GITHUB_REPO_PATTERN.exec(trimmed);

  if (!match) {
    return null;
  }

  const owner = match[1];
  const repo = match[2];

  return trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? `https://github.com/${owner}/${repo}`
    : `${owner}/${repo}`;
}

export function splitResearchTargets(terms?: string[] | null): {
  targetedRepos: string[];
  keywordTerms: string[];
} {
  const targetedRepos: string[] = [];
  const keywordTerms: string[] = [];

  for (const rawTerm of terms ?? []) {
    const trimmed = rawTerm?.trim();
    if (!trimmed) {
      continue;
    }

    const repoTarget = normalizeGitHubRepoTarget(trimmed);
    if (repoTarget) {
      targetedRepos.push(repoTarget);
      continue;
    }

    keywordTerms.push(trimmed);
  }

  return {
    targetedRepos: uniqueNonEmpty(targetedRepos),
    keywordTerms: uniqueNonEmpty(keywordTerms),
  };
}

export function buildResearchDispatchPlan(
  input: BuildResearchDispatchPlanInput,
): ResearchWorkflowDispatchPlan {
  const githubTargets = splitResearchTargets(input.githubTerms);
  const cloudflareKeywords = uniqueNonEmpty(input.googleTerms ?? []);
  const combinedKeywordTerms = uniqueNonEmpty([
    ...githubTargets.keywordTerms,
    ...cloudflareKeywords,
    input.goal ?? undefined,
  ]);
  const taskId = input.taskId ?? input.projectId;

  if (githubTargets.targetedRepos.length > 0) {
    return {
      mode: 'research-targeted',
      targetedRepos: githubTargets.targetedRepos,
      keywordTerms: [],
      payload: {
        event_type: 'research-targeted',
        client_payload: {
          task_id: taskId,
          project_id: input.projectId,
          callback_url: input.callbackUrl,
          repos: githubTargets.targetedRepos,
          target_repos: JSON.stringify(githubTargets.targetedRepos),
        },
      },
    };
  }

  const clientPayload: Record<string, unknown> = {
    task_id: taskId,
    project_id: input.projectId,
    callback_url: input.callbackUrl,
  };

  if (combinedKeywordTerms.length > 0) {
    clientPayload.search_keywords = JSON.stringify(combinedKeywordTerms);
    clientPayload.keywords = combinedKeywordTerms;
  }

  if (cloudflareKeywords.length > 0) {
    clientPayload.cloudflare_keywords = cloudflareKeywords.join(', ');
  }

  if (githubTargets.keywordTerms.length > 0) {
    clientPayload.github_keywords = githubTargets.keywordTerms.join(', ');
  }

  if (typeof input.maxWorkerRepos === 'number' && Number.isFinite(input.maxWorkerRepos)) {
    clientPayload.max_worker_repos = Math.max(1, Math.min(Math.trunc(input.maxWorkerRepos), 50));
  }

  return {
    mode: 'research-keywords',
    targetedRepos: [],
    keywordTerms: combinedKeywordTerms,
    payload: {
      event_type: 'research-keywords',
      client_payload: clientPayload,
    },
  };
}

function parseCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function inferCallbackMode(
  rawMode: unknown,
  event: ResearchWorkflowEventType,
  resultsFile?: string,
): 'health' | ResearchDispatchMode {
  if (rawMode === 'health' || rawMode === 'research-targeted' || rawMode === 'research-keywords') {
    return rawMode;
  }

  if (LEGACY_HEALTH_EVENTS.has(event)) {
    return 'health';
  }

  if (LEGACY_TARGETED_EVENTS.has(event)) {
    return 'research-targeted';
  }

  if (LEGACY_KEYWORD_EVENTS.has(event)) {
    return 'research-keywords';
  }

  if (resultsFile?.endsWith(TARGETED_RESULTS_FILE)) {
    return 'research-targeted';
  }

  return 'research-keywords';
}

function inferCallbackEvent(rawEvent: unknown, mode: unknown): ResearchWorkflowEventType {
  if (
    rawEvent === 'health' ||
    rawEvent === 'research-targeted' ||
    rawEvent === 'research-keywords' ||
    rawEvent === 'research-dispatcher-start' ||
    rawEvent === 'research-health-check' ||
    rawEvent === 'research-task' ||
    rawEvent === 'research-keyword'
  ) {
    return rawEvent;
  }

  if (mode === 'health') {
    return 'health';
  }

  if (mode === 'research-targeted') {
    return 'research-targeted';
  }

  return 'research-keywords';
}

function inferResultsFile(raw: Record<string, unknown>, taskId: string): string | undefined {
  if (typeof raw.results_file === 'string' && raw.results_file.trim()) {
    return raw.results_file.trim();
  }

  if (typeof raw.resultsFile === 'string' && raw.resultsFile.trim()) {
    return raw.resultsFile.trim();
  }

  if (typeof raw.path === 'string' && raw.path.trim().endsWith('.json')) {
    return raw.path.trim();
  }

  if (typeof raw.mode === 'string') {
    if (raw.mode === 'research-targeted') {
      return `daily-research/${taskId}/${TARGETED_RESULTS_FILE}`;
    }
    if (raw.mode === 'research-keywords') {
      return `daily-research/${taskId}/${KEYWORD_RESULTS_FILE}`;
    }
  }

  return undefined;
}

export function normalizeResearchWorkflowCallback(
  raw: Record<string, unknown>,
  routeProjectId?: string,
): NormalizedResearchWorkflowCallback {
  const taskId = String(
    raw.task_id ??
      raw.taskId ??
      raw.project_id ??
      raw.projectId ??
      routeProjectId ??
      'unknown-task',
  );
  const projectId = String(raw.project_id ?? raw.projectId ?? routeProjectId ?? taskId);
  const resultsFile = inferResultsFile(raw, taskId);
  const event = inferCallbackEvent(raw.event ?? raw.event_type, raw.mode);
  const mode = inferCallbackMode(raw.mode, event, resultsFile);
  const path = String(raw.path ?? raw.task_path ?? resultsFile ?? `daily-research/${taskId}`);
  const orchestratorPath =
    resultsFile ??
    (mode === 'research-targeted'
      ? `daily-research/${taskId}/${TARGETED_RESULTS_FILE}`
      : mode === 'research-keywords'
        ? `daily-research/${taskId}/${KEYWORD_RESULTS_FILE}`
        : path);

  return {
    event,
    mode,
    orchestratorPath,
    path,
    projectId,
    resultsFile,
    status: String(raw.status ?? 'ready'),
    taskId,
    clonedRepos: parseCount(raw.cloned_repos ?? raw.clonedRepos),
    discoveredRepos: parseCount(raw.discovered_repos ?? raw.discoveredRepos),
    newDiscoveredRepos: parseCount(raw.new_discovered_repos ?? raw.newDiscoveredRepos),
  };
}

export function buildResearchOrchestrationPrompt(
  queueRepoFullName: string,
  callback: NormalizedResearchWorkflowCallback,
): string {
  return [
    `Begin Jules orchestration for research project ${callback.projectId}.`,
    `Workflow task: ${callback.taskId}.`,
    `Queue repo: ${queueRepoFullName}.`,
    `Workflow mode: ${callback.mode}.`,
    `Use ${callback.orchestratorPath} as the primary results input.`,
    `Workflow task path: ${callback.path}.`,
    `Cloned repos: ${callback.clonedRepos}.`,
    `Discovered repos: ${callback.discoveredRepos}.`,
    `New discovered repos: ${callback.newDiscoveredRepos}.`,
  ].join(' ');
}
