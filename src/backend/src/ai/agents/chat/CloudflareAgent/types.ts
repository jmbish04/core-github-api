/**
 * @file CloudflareAgent/types.ts
 * @description Type definitions and Zod schemas for the CloudflareAgent.
 */

import { z } from 'zod';
import type { StructuredChatState, StructuredChatResult, ContentBlock } from '@/ai/providers';

// ── Chat Input ──────────────────────────────────────────────────────────────

export const CloudflareChatInputSchema = z.object({
  message: z.string().min(1),
  history: z.array(z.unknown()).optional().default([]),
  context: z.unknown().optional(),
  source: z.string().optional().default('api'),
  sessionId: z.string().optional().default('default'),
  model: z.string().optional(),
});

export type CloudflareChatInput = z.infer<typeof CloudflareChatInputSchema>;

// ── State ───────────────────────────────────────────────────────────────────

export interface CloudflareAgentState extends StructuredChatState {
  projectScaffolded?: boolean;
}

// ── Workshop Schema ─────────────────────────────────────────────────────────

export const workshopResponseSchema = {
  type: 'object' as const,
  properties: {
    blocks: {
      type: 'array' as const,
      description: 'Ordered response blocks.',
      items: {
        type: 'object' as const,
        properties: {
          type: { type: 'string' as const, enum: ['section_header', 'text', 'codeblock'] },
          text: { type: 'string' as const },
          language: { type: 'string' as const },
        },
        required: ['type', 'text'],
      },
      minItems: 1,
    },
    followupPrompts: {
      type: 'array' as const,
      items: { type: 'string' as const },
      minItems: 3,
      maxItems: 5,
    },
    agentType: {
      type: 'string' as const,
      enum: ['scaffold', 'debug', 'review', 'general'],
    },
    codeFiles: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' as const },
          content: { type: 'string' as const },
        },
        required: ['path', 'content'],
      },
    },
  },
  required: ['blocks', 'followupPrompts'],
};

// ── Re-exports ──────────────────────────────────────────────────────────────

export type { StructuredChatResult, ContentBlock };
