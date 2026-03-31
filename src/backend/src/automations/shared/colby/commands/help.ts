import type { ColbyCommandDefinition } from '../contracts';

const HELP_BODY = `## Colby Commands

Command | Description
--- | ---
\`/colby help\` | Show the supported Colby commands.
\`/colby review\` | Queue a Gemini review for the current pull request.
\`/colby summary\` | Generate a current-state summary for the current pull request.
\`/colby implement <instructions>\` | Scaffold an implementation branch and PR for an issue.
\`/colby extract\` | Extract the current review context into a digest.
\`/colby test\` | Ask Colby to generate tests for the current context.
\`/colby standardize\` | Apply repository standardization rules and sync artifacts.
\`/colby fix-all\` | Launch the container-backed full repository fixer.
\`/colby fix-types\` | Remove manual \`@cloudflare/workers-types\` imports.
\`/colby resolve-comments\` | Attempt automated review-comment or conflict resolution.`;

export const HelpCommand: ColbyCommandDefinition = {
  domain: 'issues',
  name: 'help',
  description: 'Display the supported Colby commands.',
  async execute() {
    return {
      type: 'reply',
      body: HELP_BODY,
    };
  },
};
