import { z } from 'zod';

export interface PersistentAgentState {
  status: string;
  history: Record<string, unknown>[];
  lastResult?: unknown;
}

export interface StructuredChatState extends PersistentAgentState {
  repoContext?: Record<string, unknown> | null;
  mcpCache?: Record<string, unknown>;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: z.ZodTypeAny | Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export const BASE_RESPONSE_SCHEMA = z
  .object({
    blocks: z
      .array(
        z.object({
          type: z.enum(['section_header', 'text', 'codeblock']),
          text: z.string(),
          language: z.string().optional(),
        }),
      )
      .default([]),
    followupPrompts: z.array(z.string()).default([]),
  })
  .passthrough();

export type ContentBlock = z.infer<typeof BASE_RESPONSE_SCHEMA>['blocks'][number];

export interface StructuredChatResult {
  response: string;
  blocks: ContentBlock[];
  followupPrompts: string[];
  sessionId: string;
  modelUsed: string;
}
