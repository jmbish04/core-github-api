import type { AuditResult } from '@/automations/shared/colby/contracts';

export class CodeAuditor {
  static scanFile(filePath: string, content: string): AuditResult[] {
    const results: AuditResult[] = [];

    if (filePath.endsWith('.ts') && !filePath.endsWith('worker-configuration.d.ts')) {
      const workerTypesRegex = /import\s+.*from\s+['"]@cloudflare\/workers-types['"]/;
      const match = content.match(workerTypesRegex);
      if (match) {
        results.push({
          ruleId: 'no-explicit-worker-types',
          description: 'Avoid explicit imports from @cloudflare/workers-types. Use the global Env definition.',
          severity: 'high',
          filePath,
          context: match[0],
        });
      }
    }

    return results;
  }

  static auditFiles(files: { path: string; content: string }[]): AuditResult[] {
    return files.flatMap((file) => this.scanFile(file.path, file.content));
  }
}
