import { encode } from '@utils/base64';
import type { PushContext } from '../fixers/worker_types';

export async function ensureFilesExist(ctx: PushContext, files: Record<string, string>) {
  const reposApi = ctx.octokit?.repos ?? ctx.octokit?.rest?.repos;
  if (!reposApi) {
    throw new Error('Octokit repos API is unavailable on this client.');
  }

  for (const [path, content] of Object.entries(files)) {
    try {
      await reposApi.getContent({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        path,
      });
    } catch (error: any) {
      if (error.status === 404) {
        console.log(`[Gardener] Missing file ${path}, restoring...`);
        await reposApi.createOrUpdateFileContents({
          owner: ctx.repo.owner,
          repo: ctx.repo.name,
          path,
          message: `chore(gardener): restore missing ${path}`,
          content: encode(content),
        });
      }
    }
  }
}
