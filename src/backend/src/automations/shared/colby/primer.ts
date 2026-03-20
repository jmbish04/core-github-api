export const COLBY_PRIMER = `<details>
<summary><b>Using Core Github Slash Commands (/colby)</b></summary>
<br>

The full guide for Core Github API (/colby) can be found on our \`/docs\` page, here are some quick tips.

<b>Invoking Core Github (/colby)</b>

You can request assistance from Colby at any point by creating a comment using either \`/colby <command>\` or \`@colby <command>\`. Below is a summary of the supported commands on the current page.

Feature | Command | Description
--- | --- | ---
Code Review | \`/colby review\` | Performs a code review for the current pull request in its current state.
Pull Request Summary | \`/colby summary\` | Provides a summary of the current pull request in its current state.
Comment | \`@colby\` | Responds in comments when explicitly tagged, both in pull request comments and review comments.
Help | \`/colby help\` | Displays a list of available commands.

<b>Customization</b>

To customize Core Github (/colby) for your GitHub experience, see \`/docs\` and adjust workflow behavior in \`/workflows\`.

</details>`;

export function prependColbyPrimer(body: string): string {
  if (body.includes('Using Core Github Slash Commands (/colby)')) {
    return body;
  }

  return `${COLBY_PRIMER}\n\n${body}`;
}
