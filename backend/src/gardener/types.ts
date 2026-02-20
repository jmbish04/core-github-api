/**
 * @file src/gardener/types.ts
 * @description Type definitions for the Gardener automation system.
 * @owner AI-Builder
 */

import type { Context } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'

export interface GardenerContext {
    env: Env;
    executionCtx: ExecutionContext;
    repo: {
        owner: string;
        name: string;
        defaultBranch: string;
    };
    octokit: any; // Using 'any' for now to avoid complex Octokit type generics hell, or strictly typed if possible
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
    context?: string; // The bad code snippet
}

export interface Fixer {
    id: string; // e.g. "fix-worker-types"
    name: string;
    description: string;

    /**
     * Checks if this fixer applies to the given audit result or context
     */
    canFix(audit: AuditResult): boolean;

    /**
     * Executes the fix.
     * Returns true if a PR was created/changes made, false otherwise.
     */
    execute(ctx: GardenerContext, audit: AuditResult): Promise<boolean>;
}
