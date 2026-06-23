

const BATCH_SIZE = 100;

export interface CodeChunk {
  id: string;
  repo: string;
  path: string;
  content: string;
  startLine: number;
  endLine: number;
}

export async function generateEmbeddings(env: Env, texts: string[]) {
  if (texts.length === 0) return [];

  // Using Cloudflare Workers AI for embeddings
  const response = await env.AI.run('@cf/baai/bge-large-en-v1.5', {
    text: texts,
  });

  // Type assertion since Workers AI types can be tricky
  return (response as { data: number[][] }).data;
}

export function chunkCode(content: string, path: string, maxChunkSize = 1000, overlap = 200): CodeChunk[] {
  // Simple chunking strategy - in a real app, use AST or recursive character split
  const lines = content.split('\n');
  const chunks: CodeChunk[] = [];

  let currentLine = 0;
  let chunkIndex = 0;

  while (currentLine < lines.length) {
    const endLine = Math.min(currentLine + maxChunkSize, lines.length);
    const chunkContent = lines.slice(currentLine, endLine).join('\n');

    chunks.push({
      id: `${path}-chunk-${chunkIndex}`,
      repo: '', // Set by caller
      path,
      content: chunkContent,
      startLine: currentLine + 1,
      endLine: endLine,
    });

    currentLine += (maxChunkSize - overlap);
    chunkIndex++;
  }

  return chunks;
}

export async function upsertChunks(env: Env, chunks: CodeChunk[], repoFullName: string) {
  if (chunks.length === 0) return;

  const texts = chunks.map(c => c.content);
  const embeddings = await generateEmbeddings(env, texts);

  const vectorizeVectors = chunks.map((chunk, i) => ({
    id: chunk.id,
    values: embeddings[i],
    metadata: {
      repo: repoFullName,
      path: chunk.path,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      contentLength: chunk.content.length
    }
  }));

  // Upsert in batches
  for (let i = 0; i < vectorizeVectors.length; i += BATCH_SIZE) {
    const batch = vectorizeVectors.slice(i, i + BATCH_SIZE);
    await env.RESEARCH_INDEX.upsert(batch);
  }
}
