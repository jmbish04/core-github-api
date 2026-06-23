export function extractFilesFromDiff(unidiff: string): Map<string, string> {
  const files = new Map<string, string>();
  const fileBlocks = unidiff.split(/(?=^diff --git)/m).filter(Boolean);

  for (const block of fileBlocks) {
    const pathMatch = block.match(/^\+\+\+ b\/(.+)$/m);
    if (!pathMatch) {
      continue;
    }

    const filePath = pathMatch[1];
    const lines = block.split("\n");
    const contentLines: string[] = [];

    for (const line of lines) {
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

  return files;
}
