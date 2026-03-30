import { getDb } from '@db';
import { standardizationRules } from '@db/schemas/app/standardization';
import { generateText } from '@/ai/providers';

export class RulesStandardization {
  static async enforce(
    env: Env,
    targetRepo: { owner: { login: string }; name: string; default_branch?: string },
    octokit: any,
  ) {
    console.log(`[Standardization] Enforcing standards on ${targetRepo.owner.login}/${targetRepo.name}`);

    const db = getDb(env.DB);
    let infraTags: string[] = ['Repository'];

    try {
      const { data: tree } = await octokit.rest.git.getTree({
        owner: targetRepo.owner.login,
        repo: targetRepo.name,
        tree_sha: targetRepo.default_branch || 'main',
        recursive: '1',
      });

      const paths = (tree.tree || [])
        .map((entry: { path?: string | null }) => entry.path || '')
        .filter(Boolean);
      infraTags = this.inferProjectTags(paths);
    } catch (error) {
      console.warn('[Standardization] Failed to infer project tags, using defaults.', error);
    }

    const rules = await db.select().from(standardizationRules).all();
    for (const rule of rules) {
      await this.applyRule(env, octokit, rule, targetRepo, infraTags);
    }
  }

  private static async applyRule(
    env: Env,
    octokit: any,
    rule: typeof standardizationRules.$inferSelect,
    targetRepo: { owner: { login: string }; name: string; default_branch?: string },
    targetTags: string[],
  ) {
    const relevantInfra = JSON.parse(rule.relevantInfra) as string[];
    const irrelevantInfra = JSON.parse(rule.irrelevantInfra) as string[];

    if (irrelevantInfra.length > 0 && targetTags.some((tag) => irrelevantInfra.includes(tag))) {
      return;
    }

    if (relevantInfra.length > 0 && !targetTags.some((tag) => relevantInfra.includes(tag))) {
      return;
    }

    let content: string | null = null;
    let sourceSha: string | undefined;

    try {
      const [sourceOwner, sourceRepo] = rule.sourceRepo.split('/');
      const { data: sourceFile } = await octokit.rest.repos.getContent({
        owner: sourceOwner,
        repo: sourceRepo,
        path: rule.filePath,
      });

      if (!Array.isArray(sourceFile) && sourceFile.type === 'file' && sourceFile.content) {
        content = Buffer.from(sourceFile.content, 'base64').toString('utf8');
        sourceSha = sourceFile.sha;
      }
    } catch (error: any) {
      console.warn(`[Standardization] Source file ${rule.sourceRepo}/${rule.filePath} not found.`, error.message);
      return;
    }

    if (!content) {
      return;
    }

    if (rule.aiInstructions) {
      try {
        const customizedOutput = await generateText(
          env,
          `Instructions: ${rule.aiInstructions}\nRepo: ${targetRepo.owner.login}/${targetRepo.name}\nTags: ${targetTags.join(', ')}\n\nFile Content:\n${content}`,
          'Customize the file content based on the instructions. Return only the customized file content.',
        );

        const customized = customizedOutput
          .trim()
          .replace(/^```[a-z]*\n/i, '')
          .replace(/\n```$/, '')
          .trim();

        if (customized) {
          content = customized;
          sourceSha = undefined;
        }
      } catch (error) {
        console.error(`[Standardization] AI customization failed for ${rule.filePath}`, error);
      }
    }

    try {
      let targetSha: string | undefined;
      try {
        const { data: targetFile } = await octokit.rest.repos.getContent({
          owner: targetRepo.owner.login,
          repo: targetRepo.name,
          path: rule.filePath,
        });

        if (!Array.isArray(targetFile) && targetFile.type === 'file') {
          targetSha = targetFile.sha;
          if (!rule.shouldOverwrite) {
            return;
          }
          if (sourceSha && targetFile.sha === sourceSha) {
            return;
          }
        }
      } catch (error: any) {
        if (error.status !== 404) {
          throw error;
        }
      }

      await octokit.rest.repos.createOrUpdateFileContents({
        owner: targetRepo.owner.login,
        repo: targetRepo.name,
        path: rule.filePath,
        message: `chore(standards): sync ${rule.filePath}`,
        content: Buffer.from(content as string).toString('base64'),
        sha: targetSha,
        branch: targetRepo.default_branch,
      });
    } catch (error) {
      console.error(`[Standardization] Failed to write ${rule.filePath}`, error);
    }
  }

  private static inferProjectTags(paths: string[]): string[] {
    const tags = new Set<string>(['Repository']);
    const lowerPaths = paths.map((path) => path.toLowerCase());

    if (lowerPaths.some((path) => path.endsWith('wrangler.toml') || path.endsWith('wrangler.json') || path.endsWith('wrangler.jsonc'))) {
      tags.add('cloudflare_worker');
      tags.add('cloudflare');
    }
    if (lowerPaths.some((path) => path.endsWith('package.json'))) {
      tags.add('nodejs');
    }
    if (lowerPaths.some((path) => path.endsWith('.py') || path.endsWith('requirements.txt'))) {
      tags.add('python');
    }
    if (lowerPaths.some((path) => path.includes('next.config'))) {
      tags.add('nextjs');
    }
    if (lowerPaths.some((path) => path.includes('astro.config'))) {
      tags.add('astro');
    }

    return Array.from(tags);
  }
}
