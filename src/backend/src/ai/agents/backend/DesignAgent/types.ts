/**
 * @file DesignAgent/types.ts
 * @description Zod schemas, interface definitions, and state types for DesignAgent.
 */

import { z } from 'zod';

export const StitchChatInputSchema = z.object({
  message: z.string().min(1),
  model: z.string().optional(),
});

export type StitchChatInput = z.infer<typeof StitchChatInputSchema>;

export interface StitchDesignState {
  activeProjectId: string | null;
  lastScreenId: string | null;
  designHistory: Array<{
    timestamp: string;
    action: string;
    projectId?: string;
    screenId?: string;
  }>;
}
