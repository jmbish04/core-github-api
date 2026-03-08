/**
 * AI Utility Functions
 * 
 * Provides structural helper functions for parsing and manipulating 
 * OpenAI-compatible message formats.
 * 
 * @module AI/Utils
 */


/**
 * Safely extracts string content from a ChatCompletion message.
 * Handles:
 * - Direct strings
 * - Null/Undefined (returns empty string)
 * - Array-based multimodal content (extracts 'text' parts)
 * 
 * @param content - The content field from a ChatCompletion message.
 * @returns The flattened string content.
 * @agent-note Use this when processing model responses to ensure compatibility across different provider output formats.
 */
export function getMessageContent(content: string | null | undefined | Array<any>): string {
  if (!content) return "";
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if ('text' in part) return part.text;
        return '';
      })
      .join('');
  }
  return "";
}
