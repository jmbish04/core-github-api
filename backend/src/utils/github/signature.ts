/**
 * @file backend/src/utils/github/signature.ts
 * @description Utility to sign all automated actions performed by the worker.
 * Appends a format-appropriate footer to content before it is sent to GitHub.
 */

export const SIGNATURE_MARKDOWN = "\n\n---\n*This action initiated by core-github-api*";
export const SIGNATURE_HASH = "\n\n# This action initiated by core-github-api\n";
export const SIGNATURE_DOCSTRING = "\n/* This action initiated by core-github-api */\n";

/**
 * Append an action signature to content. Selects the appropriate comment format
 * based on the file extension. Defaults to Markdown for comments/issues/PRs.
 * Idempotent — skips if the signature is already present.
 */
export function appendSignature(content: string, filename?: string): string {
  if (content.includes("core-github-api")) return content;

  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const docstringExtensions = ['js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'java', 'c', 'cpp'];
    const hashExtensions = ['yml', 'yaml', 'py', 'sh', 'rb'];

    if (ext && docstringExtensions.includes(ext)) {
      return `${content}${SIGNATURE_DOCSTRING}`;
    }
    if (ext && hashExtensions.includes(ext)) {
      return `${content}${SIGNATURE_HASH}`;
    }
  }

  // Default to Markdown signature for comments, issues, PRs
  return `${content}${SIGNATURE_MARKDOWN}`;
}
