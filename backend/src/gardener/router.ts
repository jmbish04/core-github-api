/**
 * @file src/gardener/router.ts
 * @description Routes /colby commands to the appropriate agent or fixer.
 * @owner AI-Builder
 */

import type { GardenerContext } from './types'
import { Implementer } from './agents/implementer'
import { WorkerTypeFixer } from './fixers/worker-type-fixer'
import { ContainerManager } from './ops/container-manager'
// import { Standardizer } from './orchestrator/standardizer'; // Future

export interface CommandResult {
    type: 'reply' | 'ignore';
    body?: string;
}

export class SlashCommandRouter {

    static async handle(
        text: string,
        ctx: GardenerContext,
        metadata: { issueNumber?: number, issueBody?: string }
    ): Promise<CommandResult | null> {

        // Regex to find "/colby <command> <args>"
        const commandRegex = /^\/colby\s+([a-z-]+)(?:\s+(.*))?$/m;
        const match = text.match(commandRegex);

        if (!match) return null;

        const command = match[1];
        const args = match[2] || '';

        console.log(`[Router] Detected command: ${command} with args: ${args}`);

        switch (command) {
            // --- Hygiene ---
            case 'standardize':
                return { type: 'reply', body: "🛠️ **Standardization** is coming soon!" };
            // return new Standardizer(ctx.env).runFullAudit(ctx);

            case 'fix-types': {
                // Run specific fixer implementation
                const fixer = new WorkerTypeFixer();
                const result = await fixer.fixAll(ctx);
                return { type: 'reply', body: result };
            }

            case 'fix-all':
                // HEAVY TASK: Hand off to Container
                try {
                    await new ContainerManager(ctx.env).executeTask(ctx, 'fix-all', {});
                    return { type: 'reply', body: "🚜 **Colby Container**: Starting full fix... I will report back shortly." };
                } catch (e: any) {
                    return { type: 'reply', body: `❌ **Container Error**: ${e.message}` };
                }

            // --- Development ---
            case 'resolve-conflicts':
                try {
                    await new ContainerManager(ctx.env).executeTask(ctx, 'resolve-conflicts', {
                        pr: metadata.issueNumber
                    });
                    return { type: 'reply', body: "⚔️ **Colby Container**: Attempting conflict resolution..." };
                } catch (e: any) {
                    return { type: 'reply', body: `❌ **Container Error**: ${e.message}` };
                }

            case 'implement':
            case 'take': // Alias
                if (!metadata.issueNumber || !metadata.issueBody) {
                    return { type: 'reply', body: "❌ `/colby implement` must be used in a valid Issue context." };
                }
                return new Implementer().scaffoldFromIssue(ctx, args, metadata.issueNumber, metadata.issueBody);

            case 'test':
                return new Implementer().generateTests(ctx);

            // --- Operations ---
            case 'extract':
                // This is handled by a separate flow currently, but could be unified.
                // For now, we return null to let other handlers (if any) pick it up, 
                // OR we return a message saying "Running extraction..."
                return { type: 'reply', body: "🔍 Extracting comments..." };

            case 'help':
                return {
                    type: 'reply',
                    body: `
### 🤖 Colby Command Menu

**Hygiene**
- \`/colby standardize\`: Full repo audit & fix.
- \`/colby fix-types\`: Remove manual \`@cloudflare/workers-types\`.

**Development**
- \`/colby implement <instructions>\`: Scaffold code for this issue.
- \`/colby test\`: Generate tests for this PR.
- \`/colby extract\`: Extract comments digest.
`
                };

            default:
                return { type: 'reply', body: `🤖 Unknown command: \`${command}\`. Try \`/colby help\`.` };
        }
    }

    static async handleAndReply(
        text: string,
        ctx: GardenerContext,
        metadata: { issueNumber?: number, issueBody?: string }
    ) {
        if (!metadata.issueNumber) return; // Can't reply if no issue

        const result = await this.handle(text, ctx, metadata);
        if (result && result.type === 'reply' && result.body) {
            try {
                await ctx.octokit.issues.createComment({
                    owner: ctx.repo.owner,
                    repo: ctx.repo.name,
                    issue_number: metadata.issueNumber,
                    body: result.body
                });
            } catch (e) {
                console.error('[Router] Failed to reply', e);
            }
        }
    }
}
