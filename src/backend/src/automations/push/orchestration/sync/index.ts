import { loadStandardizationScaffoldBundle } from './standardization-assets';
import { getDb } from '@/db';
import { repoSyncConfigs } from '@/db/schemas/app';
import { eq } from 'drizzle-orm';

export interface SyncManifestFile {
  path: string;
  content: string;
}

export interface SyncManifest {
  files: SyncManifestFile[];
}

export interface SyncRepositoryTarget {
  owner: string;
  name: string;
  defaultBranch: string;
  description?: string | null;
}






function matchesPattern(repoName: string, pattern: string): boolean {
  if (pattern === '*') return true;
  // Convert standard wildcard to regex
  const regexPattern = pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(repoName);
}

export async function buildSyncManifest(
  env: Env,
  octokit: any,
  target: SyncRepositoryTarget,
  triggerEvent: string = 'push'
): Promise<SyncManifest> {
  const scaffoldBundle = await loadStandardizationScaffoldBundle(env, octokit);

  const files: SyncManifestFile[] = [
    ...scaffoldBundle.lowTouchAssets,
  ];

  try {
    const db = getDb(env.DB);
    // Note: in a high volume system you might cache these configs
    const configs = await db
      .select()
      .from(repoSyncConfigs)
      .where(eq(repoSyncConfigs.isActive, true))
      .all();

    for (const config of configs) {
      if (!matchesPattern(target.name, config.targetRepoPattern)) continue;
      
      let events: string[] = [];
      try {
         events = JSON.parse(config.triggerEvents);
      } catch {
         events = ['push']; // fallback if bad JSON
      }

      if (!events.includes(triggerEvent)) continue;

      try {
        const { data } = await octokit.rest.repos.getContent({
          owner: 'jmbish04',
          repo: 'core-github-standardization',
          path: config.fileName,
          ref: 'main',
        });

        if (!Array.isArray(data) && data.type === 'file' && data.content) {
          files.push({
            path: config.fileName,
            content: atob(data.content),
          });
        }
      } catch (err: any) {
        console.warn(`[Standardization] Failed to fetch standard file ${config.fileName} for repo ${target.name}`, err.message);
      }
    }
  } catch (err: any) {
     console.error('[Standardization] Error applying repo sync configs:', err);
  }

  return { files };
}

export async function applySyncManifestToBranch(
  octokit: any,
  target: SyncRepositoryTarget,
  branch: string,
  manifest: SyncManifest,
): Promise<string[]> {
  const changedPaths: string[] = [];

  for (const file of manifest.files) {
    let existingSha: string | undefined;
    let existingContent = '';

    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: target.owner,
        repo: target.name,
        path: file.path,
        ref: branch,
      });

      if (!Array.isArray(data) && data.type === 'file' && data.content) {
        existingSha = data.sha;
        existingContent = atob(data.content);
      }
    } catch (error: any) {
      if (error.status !== 404) {
        throw error;
      }
    }

    if (existingContent === file.content) {
      continue;
    }

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: target.owner,
      repo: target.name,
      path: file.path,
      message: `chore(sync): update ${file.path}`,
      content: btoa(file.content),
      sha: existingSha,
      branch,
    });

    changedPaths.push(file.path);
  }

  return changedPaths;
}
