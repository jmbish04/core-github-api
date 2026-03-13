import { getOctokit } from '@/services/octokit/core';
import { detectWranglerConfig, extractWranglerBindings } from '@/routes/api/frontend/projects/utils';

export interface RepositoryTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  size: number;
}

export interface FrontendRouteInventoryItem {
  route: string;
  filePath: string;
  source: 'react-router' | 'astro-page' | 'convention';
}

export interface BackendEndpointInventoryItem {
  method: string;
  path: string;
  filePath: string;
}

export interface RepositoryResearchSummary {
  repo: {
    owner: string;
    name: string;
    branch: string;
    defaultBranch: string;
    repoUrl: string;
  };
  stack: {
    packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
    monorepo: boolean;
    cloudflareWorker: boolean;
    frameworks: string[];
    bindings: ReturnType<typeof extractWranglerBindings>;
    wranglerFileName: string | null;
    workerName: string | null;
  };
  treeSummary: {
    totalEntries: number;
    totalFiles: number;
    totalDirectories: number;
    topLevelFolders: string[];
    languages: Array<{ extension: string; count: number }>;
  };
  frontend: {
    present: boolean;
    routes: FrontendRouteInventoryItem[];
    entryFiles: string[];
  };
  backend: {
    present: boolean;
    endpoints: BackendEndpointInventoryItem[];
    schemaFiles: string[];
    routeFiles: string[];
  };
  integrations: string[];
  filesReviewed: string[];
  dependencySummary: string[];
  summaryMarkdown: string;
}

const FRONTEND_PATH_PREFIXES = ['frontend/', 'src/pages/', 'src/app/', 'src/components/'];
const ROUTE_FILE_PATTERN = /^backend\/src\/routes\/api\/.+\.(ts|tsx)$/;
const SCHEMA_FILE_PATTERN = /^backend\/src\/db\/schemas\/.+\.(ts|tsx)$/;
const EXTENSION_IGNORE = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'lock', 'map']);

export async function fetchRepositoryTree(
  env: Env,
  owner: string,
  repo: string,
  branch?: string,
): Promise<{ defaultBranch: string; entries: RepositoryTreeEntry[] }> {
  const octokit = await getOctokit(env);
  const repoResponse = await octokit.repos.get({ owner, repo });
  const defaultBranch = branch || repoResponse.data.default_branch || 'main';

  const treeResponse = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: defaultBranch,
    recursive: '1',
  } as any);

  const entries = ((treeResponse.data as any).tree || [])
    .filter((entry: any) => entry?.path && (entry?.type === 'blob' || entry?.type === 'tree'))
    .map(
      (entry: any): RepositoryTreeEntry => ({
        path: String(entry.path),
        type: entry.type === 'tree' ? 'tree' : 'blob',
        size: Number(entry.size || 0),
      }),
    );

  return { defaultBranch, entries };
}

export async function readRepositoryFile(
  env: Env,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<string | null> {
  const octokit = await getOctokit(env);
  try {
    const response = (await octokit.repos.getContent({ owner, repo, path, ...(ref ? { ref } : {}) })) as any;
    const data = response.data;
    if (!data || Array.isArray(data) || data.type !== 'file' || !data.content) {
      return null;
    }
    return Buffer.from(data.content, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

export async function readRepositoryFiles(
  env: Env,
  owner: string,
  repo: string,
  paths: string[],
  ref?: string,
): Promise<Array<{ path: string; content: string }>> {
  const results = await Promise.all(
    paths.map(async (path) => ({
      path,
      content: await readRepositoryFile(env, owner, repo, path, ref),
    })),
  );

  return results.filter((result): result is { path: string; content: string } => Boolean(result.content));
}

function detectPackageManager(entries: RepositoryTreeEntry[]): 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown' {
  const paths = new Set(entries.map((entry) => entry.path));
  if (paths.has('pnpm-lock.yaml')) return 'pnpm';
  if (paths.has('package-lock.json')) return 'npm';
  if (paths.has('yarn.lock')) return 'yarn';
  if (paths.has('bun.lock') || paths.has('bun.lockb')) return 'bun';
  return 'unknown';
}

function collectLanguages(entries: RepositoryTreeEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== 'blob') continue;
    const extension = entry.path.split('.').pop()?.toLowerCase() || 'none';
    if (EXTENSION_IGNORE.has(extension)) continue;
    counts.set(extension, (counts.get(extension) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([extension, count]) => ({ extension, count }));
}

function extractDependencies(packageJsonRaw: string | null): string[] {
  if (!packageJsonRaw) return [];
  try {
    const packageJson = JSON.parse(packageJsonRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Object.keys({
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    });
  } catch {
    return [];
  }
}

function detectFrameworks(dependencies: string[], entries: RepositoryTreeEntry[], wranglerFileName: string | null): string[] {
  const frameworks = new Set<string>();
  const hasPath = (prefix: string) => entries.some((entry) => entry.path.startsWith(prefix));

  if (dependencies.includes('astro')) frameworks.add('astro');
  if (dependencies.includes('react')) frameworks.add('react');
  if (dependencies.includes('hono')) frameworks.add('hono');
  if (dependencies.includes('@cloudflare/workers-types') || wranglerFileName) frameworks.add('cloudflare-workers');
  if (dependencies.includes('drizzle-orm')) frameworks.add('drizzle');
  if (dependencies.includes('honidev')) frameworks.add('honi');
  if (dependencies.includes('@assistant-ui/react')) frameworks.add('assistant-ui');
  if (dependencies.includes('recharts')) frameworks.add('recharts');
  if (hasPath('frontend/src/pages/')) frameworks.add('astro-pages');
  if (hasPath('backend/src/routes/')) frameworks.add('hono-routes');

  return Array.from(frameworks);
}

function inferRouteFromViewPath(path: string): string {
  const normalized = path
    .replace(/^frontend\/src\/views\//, '')
    .replace(/^frontend\/src\/pages\//, '')
    .replace(/\.(tsx|ts|astro|jsx|js)$/i, '')
    .replace(/\/index$/i, '/')
    .replace(/\/Home$/i, '/')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();

  const route = `/${normalized}`
    .replace(/\/+/g, '/')
    .replace(/\/public\//g, '/')
    .replace(/\/control\/global\//g, '/')
    .replace(/\/index$/, '/');

  return route === '/home' ? '/' : route;
}

function collectFrontendRoutes(entries: RepositoryTreeEntry[]): FrontendRouteInventoryItem[] {
  const items: FrontendRouteInventoryItem[] = [];
  for (const entry of entries) {
    if (entry.type !== 'blob') continue;
    if (entry.path.startsWith('frontend/src/views/') || entry.path.startsWith('frontend/src/pages/')) {
      items.push({
        route: inferRouteFromViewPath(entry.path),
        filePath: entry.path,
        source: entry.path.includes('/pages/') ? 'astro-page' : 'convention',
      });
    }
  }

  return items
    .filter((item) => item.route.startsWith('/'))
    .sort((a, b) => a.route.localeCompare(b.route))
    .slice(0, 120);
}

function extractEndpointInventory(files: Array<{ path: string; content: string }>): BackendEndpointInventoryItem[] {
  const endpoints: BackendEndpointInventoryItem[] = [];
  const patterns = [
    /app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g,
    /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g,
  ];

  for (const file of files) {
    for (const pattern of patterns) {
      let match: RegExpExecArray | null = null;
      while ((match = pattern.exec(file.content)) !== null) {
        endpoints.push({
          method: match[1]!.toUpperCase(),
          path: match[2]!,
          filePath: file.path,
        });
      }
    }
  }

  return endpoints
    .sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`))
    .slice(0, 300);
}

function detectIntegrations(dependencies: string[], files: Array<{ path: string; content: string }>): string[] {
  const integrations = new Set<string>();
  const combined = files.map((file) => file.content).join('\n');

  const dependencyMap: Array<[string, string]> = [
    ['posthog-js', 'posthog'],
    ['@sentry/browser', 'sentry'],
    ['stripe', 'stripe'],
    ['discord.js', 'discord'],
    ['@google/jules-sdk', 'jules'],
    ['@cloudflare/sandbox', 'cloudflare-sandbox'],
    ['@google/genai', 'google-genai'],
    ['@google/jules-mcp', 'jules-mcp'],
    ['react-router-dom', 'react-router'],
    ['drizzle-orm', 'drizzle'],
  ];

  for (const [dependency, label] of dependencyMap) {
    if (dependencies.includes(dependency)) integrations.add(label);
  }

  if (/posthog/i.test(combined)) integrations.add('posthog');
  if (/sentry/i.test(combined)) integrations.add('sentry');
  if (/stripe/i.test(combined)) integrations.add('stripe');
  if (/discord/i.test(combined)) integrations.add('discord');
  if (/github/i.test(combined)) integrations.add('github');
  if (/cloudflare/i.test(combined)) integrations.add('cloudflare');

  return Array.from(integrations).sort();
}

function buildSummaryMarkdown(input: {
  owner: string;
  repo: string;
  defaultBranch: string;
  frameworks: string[];
  packageManager: string;
  bindings: ReturnType<typeof extractWranglerBindings>;
  frontendRoutes: FrontendRouteInventoryItem[];
  endpoints: BackendEndpointInventoryItem[];
  schemaFiles: string[];
  integrations: string[];
  languages: Array<{ extension: string; count: number }>;
}): string {
  return [
    `# Repository Research Summary`,
    ``,
    `- Repository: ${input.owner}/${input.repo}`,
    `- Branch: ${input.defaultBranch}`,
    `- Package manager: ${input.packageManager}`,
    `- Frameworks: ${input.frameworks.join(', ') || 'unknown'}`,
    `- Cloudflare bindings: ${[
      ...input.bindings.ai,
      ...input.bindings.d1,
      ...input.bindings.r2,
      ...input.bindings.kv,
      ...input.bindings.durableObjects,
      ...input.bindings.workflows,
    ].join(', ') || 'none detected'}`,
    `- Top languages: ${input.languages.map((lang) => `${lang.extension} (${lang.count})`).join(', ') || 'unknown'}`,
    `- Frontend routes discovered: ${input.frontendRoutes.length}`,
    `- Backend endpoints discovered: ${input.endpoints.length}`,
    `- Data model files: ${input.schemaFiles.length}`,
    `- Integrations: ${input.integrations.join(', ') || 'none detected'}`,
  ].join('\n');
}

export async function performInitialRepoResearch(
  env: Env,
  input: {
    owner: string;
    repo: string;
    branch?: string;
    repoUrl: string;
  },
): Promise<RepositoryResearchSummary> {
  const { defaultBranch, entries } = await fetchRepositoryTree(env, input.owner, input.repo, input.branch);
  const branch = input.branch || defaultBranch;

  const packageFiles = await readRepositoryFiles(env, input.owner, input.repo, ['package.json', 'frontend/package.json'], branch);
  const dependencies = Array.from(
    new Set(packageFiles.flatMap((file) => extractDependencies(file.content))),
  );

  const wrangler = await detectWranglerConfig(env, input.owner, input.repo, branch);
  const bindings = extractWranglerBindings(wrangler?.config || {});
  const frameworks = detectFrameworks(dependencies, entries, wrangler?.fileName || null);

  const routeFiles = entries
    .filter((entry) => entry.type === 'blob' && ROUTE_FILE_PATTERN.test(entry.path))
    .map((entry) => entry.path)
    .slice(0, 40);
  const routeSources = await readRepositoryFiles(env, input.owner, input.repo, routeFiles, branch);
  const endpointInventory = extractEndpointInventory(routeSources);

  const schemaFiles = entries
    .filter((entry) => entry.type === 'blob' && SCHEMA_FILE_PATTERN.test(entry.path))
    .map((entry) => entry.path)
    .slice(0, 80);

  const frontendRoutes = collectFrontendRoutes(entries);
  const reviewedFiles = [
    ...packageFiles.map((file) => file.path),
    ...(wrangler?.fileName ? [wrangler.fileName] : []),
    ...routeSources.map((file) => file.path),
  ];
  const integrations = detectIntegrations(dependencies, [...packageFiles, ...routeSources]);

  return {
    repo: {
      owner: input.owner,
      name: input.repo,
      branch,
      defaultBranch,
      repoUrl: input.repoUrl,
    },
    stack: {
      packageManager: detectPackageManager(entries),
      monorepo: entries.some((entry) => entry.path.startsWith('frontend/')) && entries.some((entry) => entry.path.startsWith('backend/')),
      cloudflareWorker: Boolean(wrangler),
      frameworks,
      bindings,
      wranglerFileName: wrangler?.fileName || null,
      workerName: typeof wrangler?.config?.name === 'string' ? wrangler.config.name : null,
    },
    treeSummary: {
      totalEntries: entries.length,
      totalFiles: entries.filter((entry) => entry.type === 'blob').length,
      totalDirectories: entries.filter((entry) => entry.type === 'tree').length,
      topLevelFolders: Array.from(new Set(entries.map((entry) => entry.path.split('/')[0]).filter(Boolean))).slice(0, 20),
      languages: collectLanguages(entries),
    },
    frontend: {
      present: entries.some((entry) => FRONTEND_PATH_PREFIXES.some((prefix) => entry.path.startsWith(prefix))),
      routes: frontendRoutes,
      entryFiles: entries
        .filter((entry) => entry.type === 'blob' && (entry.path === 'frontend/src/App.tsx' || entry.path === 'frontend/src/main.tsx' || entry.path === 'frontend/src/pages/index.astro'))
        .map((entry) => entry.path),
    },
    backend: {
      present: entries.some((entry) => entry.path.startsWith('backend/src/routes/')),
      endpoints: endpointInventory,
      schemaFiles,
      routeFiles,
    },
    integrations,
    filesReviewed: Array.from(new Set(reviewedFiles)),
    dependencySummary: dependencies.sort(),
    summaryMarkdown: buildSummaryMarkdown({
      owner: input.owner,
      repo: input.repo,
      defaultBranch: branch,
      frameworks,
      packageManager: detectPackageManager(entries),
      bindings,
      frontendRoutes,
      endpoints: endpointInventory,
      schemaFiles,
      integrations,
      languages: collectLanguages(entries),
    }),
  };
}
