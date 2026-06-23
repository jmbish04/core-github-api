/**
 * AI Agent Utility Functions
 *
 * Pure helper functions for formatting, parsing, and normalizing data.
 * This file must NOT contain any AI provider imports or inference calls.
 *
 * @module AI/Agents/Support/Utils
 */
import type { AgentTool, ContentBlock } from './types';
import { BASE_RESPONSE_SCHEMA } from './types';
import { z } from 'zod';

/**
 * Safely extracts string content from a ChatCompletion message.
 * Handles direct strings, null/undefined, and array-based multimodal content.
 */
export function getMessageContent(content: string | null | undefined | Array<any>): string {
  if (!content) return "";
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if ('text' in part) return part.text;
        return '';
      })
      .join('');
  }
  return "";
}

/**
 * Formats an array of AgentTools into a human-readable instruction block
 * that can be appended to a system prompt.
 */
export function buildToolInstructions(tools?: AgentTool[]): string {
  if (!Array.isArray(tools) || tools.length === 0) {
    return '';
  }

  const lines = tools.map((tool, index) => {
    return [
      `${index + 1}. ${tool.name || `tool_${index + 1}`}`,
      `Description: ${tool.description || 'No description provided.'}`,
      `Parameters: ${JSON.stringify(tool.parameters || {}, null, 2)}`,
    ].join('\n');
  });

  return `\n\nAvailable tools (describe the intended call arguments in your response when relevant):\n${lines.join('\n\n')}`;
}

/**
 * Type guard: returns true if the value is a Zod schema.
 */
export function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return !!value && typeof value === 'object' && 'safeParse' in (value as Record<string, unknown>);
}

/**
 * Validates and normalizes raw LLM output into a ContentBlock array.
 * Handles structured objects, plain strings, and malformed responses.
 */
export function normalizeBlocks(value: unknown): ContentBlock[] {
  const parsed = BASE_RESPONSE_SCHEMA.safeParse(value);
  if (parsed.success) {
    return parsed.data.blocks;
  }

  if (typeof value === 'string' && value.trim()) {
    return [{ type: 'text', text: value.trim() }];
  }

  if (value && typeof value === 'object' && Array.isArray((value as { blocks?: unknown[] }).blocks)) {
    return ((value as { blocks: ContentBlock[] }).blocks || []).filter(Boolean);
  }

  return [];
}

/**
 * Extracts and normalizes follow-up prompt suggestions from LLM output.
 * Filters to valid strings and caps at 5.
 */
export function normalizeFollowupPrompts(value: unknown): string[] {
  if (value && typeof value === 'object' && Array.isArray((value as { followupPrompts?: unknown[] }).followupPrompts)) {
    return ((value as { followupPrompts: unknown[] }).followupPrompts || [])
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, 5);
  }

  return [];
}
