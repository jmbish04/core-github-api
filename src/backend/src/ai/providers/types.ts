export interface FallbackAlert {
  fallbackUsed: boolean;
  originalProvider: string;
  errorMessage: string;
}

export interface AIOptions {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  sanitize?: boolean;
  effort?: "low" | "medium" | "high";
  onFallback?: (alert: FallbackAlert) => void;
  skills?: string[];
  skillContext?: string;
}

export interface ToolCall {
  id: string;
  function: { name: string; arguments: string; };
}

export interface TextWithToolsResponse {
  text: string;
  toolCalls: ToolCall[];
}

export interface StructuredWithToolsResponse<T> {
  data: T;
  toolCalls: ToolCall[];
}

export interface FileInput {
  name: string;
  type: string;
  data: string;
  isBase64: boolean;
}

export type ModelCapability = 'structured_response' | 'high_reasoning' | 'fast' | 'vision' | 'function_calling';

export interface UnifiedModel {
  id: string;
  provider: string;
  name: string;
  description: string;
  capabilities: ModelCapability[];
  maxTokens?: number;
  raw: any;
}

export type ModelFilter = ModelCapability;