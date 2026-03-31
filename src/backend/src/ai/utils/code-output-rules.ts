export const FULL_CODE_OUTPUT_RULES = [
  "When generating, rewriting, or reviewing code, always return complete, ready-to-use code for every file or function you touch.",
  "Never use placeholders or elisions such as `// ... rest of the function remains the same ...`, `// leaving as is`, `// ... rest of code ...`, or any equivalent shorthand.",
  "Do not omit unchanged sections inside a file. If a file is in scope, return the full file content for that file.",
  "Do not describe skipped code with prose. Either provide the complete code or leave the file out of the response entirely.",
].join("\n");

export function withFullCodeOutputRules(instructions: string): string {
  const trimmed = instructions.trim();
  if (!trimmed) {
    return FULL_CODE_OUTPUT_RULES;
  }

  return `${trimmed}\n\nFull-code output rules:\n${FULL_CODE_OUTPUT_RULES}`;
}
