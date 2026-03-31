/**
 * AI Response Sanitization & Formatting Utility
 * 
 * Provides functions to:
 * 1. Clean raw AI output by stripping Markdown code block wrappers.
 * 2. Sanitize and escape HTML to prevent XSS.
 * 3. Perform lightweight Markdown-to-HTML transformation for safe UI rendering.
 * 
 * @module AI/Utils/Sanitizer
 */

/**
 * Strips Markdown code block wrappers (e.g., ```json ... ```) from a string.
 * Ensures the string is safe to pass into `JSON.parse()`.
 * 
 * @param output - The raw message or object from the AI.
 * @returns A cleaned JSON string.
 */
export function cleanJsonOutput(output: any): string {
    if (output === null || output === undefined) {
        return "{}";
    }

    // If it's already an object (e.g., natively parsed by AI SDK), safely stringify it
    if (typeof output === 'object') {
        try {
            return JSON.stringify(output);
        } catch (e) {
            console.error("Failed to stringify object:", JSON.stringify(e));
            return "{}";
        }
    }

    // Ensure it's a string before calling string methods
    let text = "";
    try {
        text = typeof output === 'string' ? output : String(output);
    } catch(e) {
        console.error("Failed to coerce output to string:", e);
        return "{}";
    }

    if (!text) return "{}";

    text = text.trim();

    // Strip markdown code blocks if present
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    return text;
}

/**
 * Sanitizes and formats an AI response for safe frontend display.
 * 
 * - Escapes HTML reserved characters.
 * - Converts basic Markdown (headers, bold, lists, links, code) to HTML.
 * - Adds security attributes to anchor tags.
 * 
 * @param text - Raw text from the LLM.
 * @returns Safe HTML string.
 * @agent-note Use this before piping AI text into a browser UI.
 */
export function sanitizeAndFormatResponse(text: string): string {
    if (!text) return "";

    // 1. Clean low hanging fruit (outer code blocks)
    let cleaned = cleanJsonOutput(text);

    // 2. Escape HTML characters to prevent XSS
    // This is CRITICAL: It ensures that if the AI outputs "<script>", 
    // it becomes "&lt;script&gt;" and renders as text, not executable code.
    cleaned = cleaned
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // 3. Convert Markdown to HTML

    // Headers (h1-h3)
    // Matches line start, hashes, space, content
    cleaned = cleaned.replace(/^### (.*$)/gm, "<h3>$1</h3>");
    cleaned = cleaned.replace(/^## (.*$)/gm, "<h2>$1</h2>");
    cleaned = cleaned.replace(/^# (.*$)/gm, "<h1>$1</h1>");

    // Bold: **text**
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Italic: *text*
    cleaned = cleaned.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Strikethrough: ~~text~~
    cleaned = cleaned.replace(/~~(.*?)~~/g, "<del>$1</del>");

    // Code Blocks: ```language\ncode```
    // Matches ```...``` across multiple lines. Captures language (group 1) and code (group 2).
    cleaned = cleaned.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
    });

    // Inline Code: `text`
    cleaned = cleaned.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Links: [Text](url)
    // Adds target="_blank" and rel="noopener noreferrer" for security and UX.
    cleaned = cleaned.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">$1</a>'
    );

    // Lists: - Item
    // Converts "- Item" to "<li>Item</li>". Note: Does not wrap in <ul>/ol tags.
    cleaned = cleaned.replace(/^\s*-\s+(.*$)/gm, "<li>$1</li>");

    // Newlines: Convert remaining newlines to <br> to preserve spacing
    cleaned = cleaned.replace(/\n/g, "<br>");

    // Cleanup: Remove <br> immediately following block closing tags to prevent double spacing
    cleaned = cleaned.replace(/(<\/h[1-6]>|<\/pre>|<\/li>)\s*<br>/g, "$1");

    return cleaned;
}