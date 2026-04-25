import type { PersistentAgentState } from '@/ai/providers/agent-support/types';

export interface CoordinatorState extends PersistentAgentState {
  currentContextId?: string;
}
