import type { CommandResult, PushContext } from './fixers/worker_types'

export class SlashCommandRouter {

    static async handle(
        text: string,
        ctx: PushContext,
        metadata: { issueNumber?: number, issueBody?: string }
    ): Promise<CommandResult | null> {

        // Regex to find "/colby <command> <args>"
        const commandRegex = /^\/colby\s+([a-z-]+)(?:\s+(.*))?$/m;
        const match = text.match(commandRegex);
        if (!match) return null;

        const commandName = match[1];
        const args = match[2] || '';

        console.log(`[Router] Detected command: ${commandName} with args: ${args}`);

        const { CommandRegistry } = await import('./commands/registry');

        const command = CommandRegistry.find(c => 
            c.name === commandName || c.aliases?.includes(commandName)
        );

        if (!command) {
             return { type: 'reply', body: `🤖 Unknown command: \`${commandName}\`. Try \`/colby help\`.` };
        }

        return command.handle(args, ctx, metadata);
    }

    static async handleAndReply(
        text: string,
        ctx: PushContext,
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
