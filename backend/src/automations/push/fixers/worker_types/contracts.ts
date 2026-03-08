export interface PushContext {
  env: Env;
  executionCtx: ExecutionContext;
  repo: {
    owner: string;
    name: string;
    defaultBranch: string;
  };
  octokit: any;
  installationId?: number;
}

export interface RepoFingerprint {
  stack: 'cloudflare-worker' | 'nextjs' | 'python' | 'unknown';
  framework: 'hono' | 'react' | 'none' | 'unknown';
  hasWranglerToml: boolean;
  hasWranglerJson: boolean;
  hasPublicDir: boolean;
  hasTests: boolean;
  bindings: {
    d1: boolean;
    kv: boolean;
    r2: boolean;
    ai: boolean;
  };
}

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AuditResult {
  ruleId: string;
  description: string;
  severity: AuditSeverity;
  filePath?: string;
  line?: number;
  context?: string;
}

export interface Fixer {
  id: string;
  name: string;
  description: string;
  canFix(audit: AuditResult): boolean;
  execute(ctx: PushContext, audit: AuditResult): Promise<boolean>;
}

export interface CommandResult {
  type: 'reply' | 'ignore';
  body?: string;
}

export interface ISlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  handle(
    args: string,
    ctx: PushContext,
    metadata: { issueNumber?: number; issueBody?: string },
  ): Promise<CommandResult | null>;
}
