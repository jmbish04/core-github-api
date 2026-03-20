/**
 * Vectorize Index MCP Tools
 * 
 * Exposes Cloudflare Vectorize operations as tools for AI agents.
 * Handles semantic search, text chunking, and vector upsertion with automated 
 * embedding generation via OpenAI/AI Gateway.
 * 
 * @module AI/MCP/Tools/Vectorize
 */
import { z } from 'zod';
import type { AgentTool as Tool } from '@/ai/agents/support/types';

// Helper to get OpenAI client for embeddings via Gateway

async function getEmbeddingClient(env: Env) {
  const gatewayId = env.AI_GATEWAY_NAME || 'rag';
  const gateway = env.AI.gateway(gatewayId);
  const baseUrl = await gateway.getUrl("openai"); // Specific OpenAI endpoint for real ada-002
  const apiKey = await env.AI_GATEWAY_TOKEN.get();
  
  return {
    embeddings: {
      create: async (body: any) => {
        const res = await fetch(baseUrl + '/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey || "dummy-key"}`,
          },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`Gateway Embeddings Error: ${await res.text()}`);
        return await res.json();
      }
    }
  } as any;
}

// Helper for vector normalization (L2)
function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector; // Avoid division by zero
  return vector.map(val => val / magnitude);
}

/**
 * Tool for searching the Vectorize index.
 * Generates an embedding for the query and searches the index.
 */

export const VectorizeSearchTool = (env: Env): Tool => ({
  name: 'vectorize_search',
  description: 'Search the semantic vector index for relevant documents. Returns closest matches.',
  parameters: z.object({
    query: z.string().describe('The search query string.'),
    topK: z.number().optional().default(5).describe('Number of results to return.'),
    isTest: z.boolean().optional().default(false).describe('If true, include test vectors.')
  }),
  execute: async (args: Record<string, unknown>) => {
    const query = args.query as string;
    const topK = (args.topK as number) ?? 5;
    const isTest = (args.isTest as boolean) ?? false;

    try {
      const client = await getEmbeddingClient(env);
      const embeddingResponse = await client.embeddings.create({
        model: 'text-embedding-ada-002', // Vectorize configured with this model
        input: query
      });
      const rawVector = embeddingResponse.data[0].embedding;
      const vector = normalizeVector(rawVector);
      
      const filter = !isTest ? { is_testing_ignore: false } : undefined;

      const matches = await env.VECTORIZE.query(vector, { topK, returnMetadata: true, filter });
      return matches;
    } catch (e) {
      const error = e as Error;
      return { error: error.message };
    }
  }
});

/**
 * Tool for upserting text into the Vectorize index.
 * Chunks the text, generates embeddings, and inserts them.
 * Uses langchain RecursiveCharacterTextSplitter.
 */

export const VectorizeUpsertTool = (env: Env): Tool => ({
  name: 'vectorize_upsert',
  description: 'Chunk, embed, and upsert text into the vector index. Associates vectors with a document ID.',
  parameters: z.object({
    documentId: z.string().describe('The ID of the parent document (e.g. from a D1 table).'),
    text: z.string().describe('The full text content to index.'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata to store with vectors.'),
    isTest: z.boolean().optional().default(false).describe('If true, marks vectors as test data.')
  }),
  execute: async (args: Record<string, unknown>) => {
    const documentId = args.documentId as string;
    const text = args.text as string;
    const metadata = (args.metadata as Record<string, unknown>) || {};
    const isTest = (args.isTest as boolean) ?? false;

    try {
      // 1. Chunking
      // Basic recursive chunking without @langchain/textsplitters bloat
      const chunks: { pageContent: string }[] = [];
      const chunkSize = 1000;
      const textChunks = text.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];
      for (const t of textChunks) {
        chunks.push({ pageContent: t });
      }

      if (chunks.length === 0) return { success: true, count: 0 };

      // 2. Embeddings
      const client = await getEmbeddingClient(env);
      // Batch embedding generation (check limits, but usually fine for reasonable docs)
      const textsToEmbed = chunks.map(c => c.pageContent);
      
      const embeddingResponse = await client.embeddings.create({
        model: 'text-embedding-ada-002', // Vectorize configured with this model
        input: textsToEmbed
      });

      // 3. Prepare Vectorize records
      const vectors = embeddingResponse.data.map((item: any, index: number) => ({
        id: `${documentId}_chunk_${index}`, // Unique ID for chunk
        values: normalizeVector(item.embedding),
        metadata: {
          ...metadata,
          documentId: documentId,
          text: chunks[index].pageContent,
          chunkIndex: index,
          is_testing_ignore: isTest // Populated here
        }
      }));

      // 4. Upsert (Vectorize has batch limits, typically 1000, usually fine here)
      const inserted = await env.VECTORIZE.upsert(vectors);

      return {
        success: true,
        count: vectors.length,
        inserted
      };

    } catch (e) {
      const error = e as Error;
      return { error: error.message };
    }
  }
});
