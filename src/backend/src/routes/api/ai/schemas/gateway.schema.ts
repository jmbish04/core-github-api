import { z } from '@hono/zod-openapi';

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  name: z.string().optional(),
});

export const ChatCompletionRequestSchema = z.object({
  model: z.string().openapi({
    example: 'gpt-4o-mini',
    description: 'The AI model ID (e.g., gpt-4o-mini, @cf/meta/llama-3.3-70b-instruct-fp8-fast)',
  }),
  messages: z.array(ChatMessageSchema).openapi({
    description: 'The sequence of chat messages',
  }),
  temperature: z.number().min(0).max(2).optional(),
  response_format: z.record(z.string(), z.any()).optional().openapi({
    description: 'Structured output format, e.g. {"type": "json_object"}',
  }),
  stream: z.boolean().optional(),
}).passthrough().openapi('ChatCompletionRequest');

export const EmbeddingRequestSchema = z.object({
  model: z.string().openapi({
    example: '@cf/baai/bge-large-en-v1.5',
  }),
  input: z.union([z.string(), z.array(z.string())]).openapi({
    description: 'Input text to embed, encoded as a string or array of strings.',
  }),
}).passthrough().openapi('EmbeddingRequest');
