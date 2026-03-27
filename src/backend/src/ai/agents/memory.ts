import type { MemoryConfig } from 'honidev';

export interface AgentMemoryOptions {
  agentName: string;
  episodicBinding?: string;
  episodicLimit?: number;
  semanticBinding?: string;
  semanticTopK?: number;
  graphId?: string;
  graphBinding?: string;
  graphUrlEnvVar?: string;
  graphApiKeyEnvVar?: string;
  graphContextDepth?: number;
  graphMaxContextEntities?: number;
}

function slugifyAgentName(agentName: string): string {
  return agentName
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function buildMaxAgentMemory(options: AgentMemoryOptions): MemoryConfig {
  const slug = slugifyAgentName(options.agentName);

  return {
    enabled: true,
    episodic: {
      enabled: true,
      binding: options.episodicBinding ?? 'DB',
      limit: options.episodicLimit ?? 100,
    },
    semantic: {
      enabled: true,
      binding: options.semanticBinding ?? 'VECTORIZE',
      aiBinding: 'AI',
      topK: options.semanticTopK ?? 8,
    },
    graph: {
      enabled: true,
      graphId: options.graphId ?? `core-github-api-${slug}`,
      binding: options.graphBinding ?? 'EDGRAPH',
      apiKeyEnvVar: options.graphApiKeyEnvVar ?? 'EDGRAPH_API_KEY',
      contextDepth: options.graphContextDepth ?? 2,
      maxContextEntities: options.graphMaxContextEntities ?? 8,
    },
  };
}
