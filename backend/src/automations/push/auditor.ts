/**
 * @file src/gardener/auditor.ts
 * @description Scans codebase for anti-patterns and compliance gaps.
 * @owner AI-Builder
 */

import type { AuditResult } from './fixers/worker_types'

export class CodeAuditor {

    /**
     * Runs a quick regex scan on file content.
     */
    static scanFile(filePath: string, content: string): AuditResult[] {
        const results: AuditResult[] = [];

        // RULE 1: Explicit @cloudflare/workers-types import
        // Anti-pattern: import { ... } from '@cloudflare/workers-types'
        // Whitelist: worker-configuration.d.ts
        if (filePath.endsWith('.ts') && !filePath.endsWith('worker-configuration.d.ts')) {
            const workerTypesRegex = /import\s+.*from\s+['"]@cloudflare\/workers-types['"]/;
            const match = content.match(workerTypesRegex);
            if (match) {
                results.push({
                    ruleId: 'no-explicit-worker-types',
                    description: 'Avoid explicit imports from @cloudflare/workers-types. Use global Env definition.',
                    severity: 'high',
                    filePath,
                    context: match[0],
                    // line number calc could go here
                });
            }
        }

        // RULE 2: Hardcoded Secrets (Basic Heuristic)
        // Look for 'Bearer sk-...' or similar. Very naive, just an example.
        // Skipping for now to avoid false positives.

        return results;
    }

    /**
     * Audits a list of files (simplistic version).
     * In a real worker, we'd fetch these from GitHub API.
     */
    static auditFiles(files: { path: string, content: string }[]): AuditResult[] {
        return files.flatMap(f => this.scanFile(f.path, f.content));
    }
}
