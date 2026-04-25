
export function parseChangeSet(
  text?: string | null
): { filename: string; content: string }[] {
  if (!text) return [];
  const files: { filename: string; content: string }[] = [];
  const parts = text.split("## File: ");
  for (let i = 1; i < parts.length; i++) {
    const section = parts[i];
    const newlineIdx = section.indexOf("\n");
    if (newlineIdx !== -1) {
      files.push({
        filename: section.substring(0, newlineIdx).trim(),
        content: section.substring(newlineIdx + 1).trim(),
      });
    }
  }
  return files;
}

export function extractFilesFromUnifiedDiff(
  unidiff?: string | null
): { filename: string; content: string }[] {
  if (!unidiff) return [];

  const files = new Map<string, string>();
  const fileBlocks = unidiff.split(/(?=^diff --git)/m).filter(Boolean);

  for (const block of fileBlocks) {
    const pathMatch = block.match(/^\+\+\+ b\/(.+)$/m);
    if (!pathMatch) continue;

    const filePath = pathMatch[1];
    const contentLines: string[] = [];

    for (const line of block.split("\n")) {
      if (
        line.startsWith("+++") ||
        line.startsWith("---") ||
        line.startsWith("@@") ||
        line.startsWith("diff --git") ||
        line.startsWith("index ") ||
        line.startsWith("new file")
      ) {
        continue;
      }

      if (line.startsWith("+")) {
        contentLines.push(line.slice(1));
      }
    }

    if (contentLines.length > 0) {
      files.set(filePath, contentLines.join("\n"));
    }
  }

  return Array.from(files.entries()).map(([filename, content]) => ({
    filename,
    content,
  }));
}

export function parsePullRequestNumber(url?: string): number {
  if (!url) return 0;
  const match = url.match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : 0;
}
