export type ColbyThreadKind = 'issue' | 'pull_request' | 'review_comment' | 'review';
export type ColbyCommandDomain = 'issues' | 'pr' | 'push' | 'repository' | 'security';

export interface ColbyCommandContext {
  env: Env;
  executionCtx: ExecutionContext;
  octokit: any;
  installationId?: number;
  repo: {
    owner: string;
    name: string;
    defaultBranch: string;
  };
  thread: {
    kind: ColbyThreadKind;
    number: number;
    isPullRequest: boolean;
  };
  source: {
    eventName: string;
    action: string | null;
  };
}

export interface ColbyInvocation {
  trigger: 'slash' | 'mention';
  raw: string;
  body: string;
  command: string;
  args: string;
}

export interface ColbyCommandResult {
  type: 'reply' | 'ignore';
  body?: string;
  skipPrimer?: boolean;
}

export interface ColbyCommandDefinition {
  domain: ColbyCommandDomain;
  name: string;
  aliases?: string[];
  description: string;
  requiresPr?: boolean;
  execute(
    invocation: ColbyInvocation,
    ctx: ColbyCommandContext,
  ): Promise<ColbyCommandResult | null>;
}

export interface ColbyRouteModule {
  domain: ColbyCommandDomain;
  commands: ColbyCommandDefinition[];
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
  execute(ctx: ColbyCommandContext, audit: AuditResult): Promise<boolean>;
}
