export type ReverseEngineeringStatus =
  | 'pending'
  | 'running'
  | 'awaiting_auth'
  | 'complete'
  | 'failed';

export interface ReverseEngineeringAuth {
  type?: 'bearer_header' | 'custom_header' | 'basic_auth' | 'cookie' | 'query_param';
  headerName?: string;
  headerValue?: string;
  queryParamName?: string;
  queryParamValue?: string;
  username?: string;
  password?: string;
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
  }>;
  notes?: string;
}

export interface ReverseEngineeringEvent {
  id?: string;
  snapshotId: string;
  eventType?: string;
  type?: string;
  title?: string | null;
  message?: string | null;
  createdAt?: string;
  ts?: string;
  payload?: unknown;
}

export interface ReverseEngineeringPageAnalysis {
  route: string;
  filePath?: string | null;
  title?: string;
  description?: string;
  codeAnalysis?: string;
  visionAnalysis?: string;
  components?: Array<{
    type: string;
    label?: string;
    description: string;
  }>;
  perceivedFunctionality?: string[];
  userJourney?: string[];
}

export interface ReverseEngineeringSnapshotDetail {
  id: string;
  projectId?: string | null;
  githubOwner: string;
  githubRepo: string;
  repoUrl: string;
  branch: string;
  frontendUrl?: string | null;
  resolvedPreviewUrl?: string | null;
  status: ReverseEngineeringStatus;
  title?: string | null;
  detectedStack?: Record<string, unknown> | null;
  previewResolution?: Record<string, unknown> | null;
  frontendAuth?: Record<string, unknown> | null;
  requestedAuth?: Record<string, unknown> | null;
  screenshotUrls?: string[];
  prdMarkdown?: string | null;
  epics?: Array<{
    title: string;
    description: string;
    userStories?: Array<{
      title: string;
      description: string;
      acceptanceCriteria?: string[];
    }>;
  }>;
  userJourneys?: Array<{
    name: string;
    actor: string;
    steps?: string[];
    outcome?: string;
  }>;
  repoResearch?: Record<string, unknown> | null;
  julesResearch?: Record<string, unknown> | null;
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  ux?: {
    overallDescription?: string | null;
    pageAnalyses?: ReverseEngineeringPageAnalysis[];
    screenshotGallery?: Array<{
      route: string;
      filePath?: string | null;
      resolvedUrl?: string;
      imageId?: string | null;
      screenshotUrls?: string[];
      visionDescription?: string | null;
    }>;
  } | null;
  backend?: {
    architectureMarkdown?: string | null;
    endpointInventory?: Array<{
      method: string;
      path: string;
      filePath: string;
    }>;
    dataModel?: unknown;
    integrations?: Array<{ name: string; description: string }>;
    authModel?: unknown;
    deploymentModel?: unknown;
  } | null;
  events?: ReverseEngineeringEvent[];
}

export interface ReverseEngineeringListItem {
  id: string;
  projectId?: string | null;
  githubOwner: string;
  githubRepo: string;
  repoUrl: string;
  branch: string;
  frontendUrl?: string | null;
  resolvedPreviewUrl?: string | null;
  status: ReverseEngineeringStatus;
  title?: string | null;
  detectedStack?: Record<string, unknown> | null;
  previewResolution?: Record<string, unknown> | null;
  frontendAuth?: Record<string, unknown> | null;
  screenshotUrls?: string[];
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  errorMessage?: string | null;
}

function jsonHeaders() {
  return { 'Content-Type': 'application/json' };
}

export async function listReverseEngineeringSnapshots(params?: {
  q?: string;
  status?: ReverseEngineeringStatus;
  projectId?: string;
  limit?: number;
}): Promise<ReverseEngineeringListItem[]> {
  const search = new URLSearchParams();
  if (params?.q) search.set('q', params.q);
  if (params?.status) search.set('status', params.status);
  if (params?.projectId) search.set('projectId', params.projectId);
  if (params?.limit) search.set('limit', String(params.limit));

  const response = await fetch(`/api/reverse-engineering/snapshots?${search.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to list reverse-engineering snapshots.');
  }

  const data = (await response.json()) as { success: boolean; snapshots: ReverseEngineeringListItem[] };
  return data.snapshots;
}

export async function createReverseEngineeringSnapshot(input: {
  repoInput: string;
  branch: string;
  frontendUrl?: string;
  auth?: ReverseEngineeringAuth;
  useSandboxPreview?: boolean;
  title?: string;
}): Promise<{ snapshotId: string }> {
  const payload: Record<string, unknown> = {
    branch: input.branch,
    frontendUrl: input.frontendUrl || undefined,
    auth: input.auth,
    useSandboxPreview: input.useSandboxPreview ?? true,
    title: input.title || undefined,
  };

  if (/^https?:\/\//i.test(input.repoInput)) {
    payload.repoUrl = input.repoInput;
  } else {
    payload.githubRepo = input.repoInput;
  }

  const response = await fetch('/api/reverse-engineering/analyze', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as { success: boolean; snapshotId: string; error?: string };
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to create reverse-engineering snapshot.');
  }

  return { snapshotId: data.snapshotId };
}

export async function getReverseEngineeringSnapshot(snapshotId: string): Promise<ReverseEngineeringSnapshotDetail> {
  const response = await fetch(`/api/reverse-engineering/snapshots/${snapshotId}`);
  if (!response.ok) {
    throw new Error('Failed to load reverse-engineering snapshot.');
  }

  const data = (await response.json()) as { success: boolean; snapshot: ReverseEngineeringSnapshotDetail };
  return data.snapshot;
}

export async function listReverseEngineeringEvents(snapshotId: string): Promise<ReverseEngineeringEvent[]> {
  const response = await fetch(`/api/reverse-engineering/snapshots/${snapshotId}/events`);
  if (!response.ok) {
    throw new Error('Failed to load reverse-engineering events.');
  }

  const data = (await response.json()) as { success: boolean; events: ReverseEngineeringEvent[] };
  return data.events;
}

export async function resumeReverseEngineeringSnapshot(
  snapshotId: string,
  input: { auth: ReverseEngineeringAuth; frontendUrl?: string },
) {
  const response = await fetch(`/api/reverse-engineering/snapshots/${snapshotId}/resume`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as { success: boolean; error?: string };
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to resume reverse-engineering snapshot.');
  }
}

export async function consultReverseEngineeringSnapshot(
  snapshotId: string,
  input: {
    message: string;
    role?: 'general' | 'product' | 'ux' | 'frontend' | 'backend' | 'cloudflare';
    history?: Array<{ role: string; content: string }>;
    sessionId?: string;
  },
): Promise<{ response: string; state?: unknown }> {
  const response = await fetch(`/api/reverse-engineering/snapshots/${snapshotId}/consult`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({ error: 'Consultant request failed.' }))) as {
      error?: string;
    };
    throw new Error(data.error || 'Consultant request failed.');
  }

  return (await response.json()) as { response: string; state?: unknown };
}

export function getReverseEngineeringWebSocketUrl(snapshotId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/reverse-engineering/snapshots/${snapshotId}/ws`;
}
