import YAML from 'yaml';
import { generateText } from '@/ai/providers';
import { withFullCodeOutputRules } from '@/ai/utils/code-output-rules';
import { Logger } from '@/lib/logger';

interface FrontmatterParseResult {
  frontmatter: Record<string, unknown>;
  body: string;
}

function parseFrontmatter(markdown: string): FrontmatterParseResult {
  const normalized = markdown.trim();
  if (!normalized.startsWith('---')) {
    return { frontmatter: {}, body: normalized };
  }

  const end = normalized.indexOf('\n---', 3);
  if (end === -1) {
    return { frontmatter: {}, body: normalized };
  }

  const rawFrontmatter = normalized.slice(4, end).trim();
  const body = normalized.slice(end + 4).trim();

  try {
    const parsed = YAML.parse(rawFrontmatter) as Record<string, unknown> | null;
    return { frontmatter: parsed || {}, body };
  } catch {
    return { frontmatter: {}, body: normalized };
  }
}

function stringifyFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  const yaml = YAML.stringify(frontmatter).trim();
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}

function sanitizeRepositoryAgentMarkdown(
  markdown: string,
  repoName: string,
  repoDescription: string | null,
): string {
  const parsed = parseFrontmatter(markdown);
  const safeFrontmatter: Record<string, unknown> = {
    name: typeof parsed.frontmatter.name === 'string' ? parsed.frontmatter.name : 'Repo Specialist',
    description:
      typeof parsed.frontmatter.description === 'string'
        ? parsed.frontmatter.description
        : repoDescription || `Repository specialist for ${repoName}.`,
    tools: Array.isArray(parsed.frontmatter.tools) && parsed.frontmatter.tools.length > 0
      ? parsed.frontmatter.tools
      : ['read', 'edit', 'search'],
  };

  if (typeof parsed.frontmatter.target === 'string' && parsed.frontmatter.target.trim()) {
    safeFrontmatter.target = parsed.frontmatter.target;
  }

  const safeBody = parsed.body || `# Repo Specialist\n\nYou are the dedicated repository specialist for ${repoName}. Focus on code quality, Cloudflare compatibility, repository hygiene, and actionable pull request guidance.`;
  return stringifyFrontmatter(safeFrontmatter, safeBody);
}

const DEFAULT_REPOSITORY_SPECIALIST_TEMPLATE = `---
name: Repo Specialist
description: Repository specialist for Cloudflare Worker engineering.
tools:
  - read
  - edit
  - search
target: github
---

# Repo Specialist

You are the dedicated repository specialist for this codebase.

## Priorities
- Preserve Cloudflare Worker compatibility.
- Keep automation logic modular and typed.
- Prefer targeted, reviewable pull requests over sweeping rewrites.
- Document risks and tradeoffs directly in pull request language.

## Output Discipline
- When drafting code or patches, return complete files for every touched file.
- Never use placeholders such as "rest of the file remains the same" or similar elisions.
`;

export class RepoSpecialistBuilder {
  private readonly logger: Logger;

  constructor(private readonly env: Env) {
    this.logger = new Logger(env, 'ai/services/repository-specialist-builder');
  }

  async generateAgentMarkdown(
    repoName: string,
    repoDescription: string | null,
    existingContent: string | null,
  ): Promise<string> {
    const seed = existingContent || DEFAULT_REPOSITORY_SPECIALIST_TEMPLATE;

    const systemPrompt = withFullCodeOutputRules(
      'You are designing a repository-scoped GitHub custom agent profile. Output raw markdown only. The profile must contain YAML frontmatter followed by instructions. Repository-scoped profiles must only use the keys name, description, tools, and target in frontmatter. Do not emit model. Do not emit mcp-servers.',
    );

    const prompt = `Repository: ${repoName}\nDescription: ${repoDescription || 'No description provided.'}\n\nStarting profile:\n${seed}\n\nRegenerate this as a concise, opinionated repository specialist for the repo.`;

    try {
      const generated = await generateText(
        this.env,
        prompt,
        systemPrompt,
        { model: '@cf/meta/llama-3.1-8b-instruct', maxTokens: 1200 },
        'worker-ai',
      );
      return sanitizeRepositoryAgentMarkdown(generated, repoName, repoDescription);
    } catch (error) {
      this.logger.warn('Failed to generate repository specialist markdown, using sanitized seed.', {
        error,
      });
      return sanitizeRepositoryAgentMarkdown(seed, repoName, repoDescription);
    }
  }
}
