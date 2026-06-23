/**
 * @file WorkshopAgent/types.ts
 * @description Type definitions for the WorkshopAgent Agent.
 */
import type { StructuredChatState } from '@/ai/providers';

export interface WorkshopAgentState extends StructuredChatState {
  activeProjectId?: string;
}

export type WorkshopHealth = {
  status: string;
  agent: string;
  timestamp: string;
  activeProjectId?: string;
};
