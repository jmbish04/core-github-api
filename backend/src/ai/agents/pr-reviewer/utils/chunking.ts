/**
 * Utility to chunk large diffs to respect LLM context windows.
 */

export interface DiffChunk {
  filename: string;
  chunkId: number;
  content: string;
}

export function chunkDiff(filename: string, diffText: string, maxLines: number = 200): DiffChunk[] {
  if (!diffText) return [];

  const lines = diffText.split('\n');
  const chunks: DiffChunk[] = [];
  let currentChunkId = 0;

  for (let i = 0; i < lines.length; i += maxLines) {
    chunks.push({
      filename,
      chunkId: currentChunkId++,
      content: lines.slice(i, i + maxLines).join('\n')
    });
  }

  return chunks;
}

export function chunkFiles(files: any[], maxLinesPerChunk: number = 200): DiffChunk[] {
  const allChunks: DiffChunk[] = [];
  for (const file of files) {
    if (!file.patch) continue;
    const fileChunks = chunkDiff(file.filename, file.patch, maxLinesPerChunk);
    allChunks.push(...fileChunks);
  }
  return allChunks;
}
