import { z } from "zod";

// -----------------------------------------------------------------------------
// Zod Schemas for Webhook Summary
// -----------------------------------------------------------------------------

export const WebhookSenderSchema = z.object({
  login: z.string(),
  id: z.number().optional(),
  avatar_url: z.string().url().optional(),
  url: z.string().url().optional(),
  html_url: z.string().url().optional(),
  type: z.string().optional(),
});

export const WebhookRepositorySchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  full_name: z.string(),
  html_url: z.string().url().optional(),
  description: z.string().nullable().optional(),
  private: z.boolean().optional(),
});

export const WebhookStepSchema = z.object({
  number: z.number(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
});

export const WebhookWorkflowJobSchema = z.object({
  id: z.number(),
  run_id: z.number(),
  workflow_name: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  head_branch: z.string().nullable().optional(),
  html_url: z.string().url().optional(),
  status: z.string(),
  conclusion: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  steps: z.array(WebhookStepSchema).optional(),
});

/**
 * The core summary schema.
 * Zod implicitly strips any keys not defined here — perfectly
 * handles removing the dozens of "spam" URLs (followers_url, keys_url, etc.)
 */
export const GithubWebhookSummarySchema = z.object({
  action: z.string().optional(),
  sender: WebhookSenderSchema.optional(),
  repository: WebhookRepositorySchema.optional(),
  workflow_job: WebhookWorkflowJobSchema.optional(),
});

export type GithubWebhookSummary = z.infer<typeof GithubWebhookSummarySchema>;

// -----------------------------------------------------------------------------
// Parsing Module
// -----------------------------------------------------------------------------

/**
 * Parses a raw GitHub Webhook Payload and returns a clean, summarized version
 * containing only the important details for the UI.
 */
export function summarizeWebhookPayload(rawPayload: unknown): GithubWebhookSummary {
  try {
    return GithubWebhookSummarySchema.parse(rawPayload);
  } catch (error) {
    console.warn("Webhook payload did not match expected summary schema. Attempting safe fallback.", error);

    const result = GithubWebhookSummarySchema.safeParse(rawPayload);
    if (result.success) {
      return result.data;
    }

    // Absolute worst-case fallback
    const safePayload = rawPayload as Record<string, any>;
    return {
      action: safePayload?.action ?? "unknown",
      sender: safePayload?.sender ? {
        login: safePayload.sender.login ?? "Unknown Sender",
        url: safePayload.sender.url,
        html_url: safePayload.sender.html_url,
      } : undefined,
    };
  }
}

/**
 * Utility to format duration between two ISO timestamps.
 */
export function getDurationMs(startedAt?: string | null, completedAt?: string | null): number | null {
  if (!startedAt || !completedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();

  if (isNaN(start) || isNaN(end)) return null;
  return end - start;
}
