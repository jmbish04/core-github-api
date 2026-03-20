import { z } from "zod";
import { matchAutomations } from "@/automations/triggers";

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
  /**
   * The list of automation workflow IDs that were triggered by this event.
   * e.g. ["deploy-production", "run-tests"]
   * Computed at storage time via matchAutomations().
   */
  triggered_workflows: z.array(z.string()).optional(),
});

export type GithubWebhookSummary = z.infer<typeof GithubWebhookSummarySchema>;

// -----------------------------------------------------------------------------
// Parsing Module
// -----------------------------------------------------------------------------

/**
 * Parses a raw GitHub Webhook Payload and returns a clean, summarized version
 * containing only the important details for the UI.
 *
 * @param rawPayload - The raw webhook payload object
 * @param eventType  - The x-github-event header value (used to match automation rules)
 * @param rules - List of dynamic rules from DB
 */
export function summarizeWebhookPayload(rawPayload: unknown, eventType?: string, rules: any[] = []): GithubWebhookSummary {
  // Resolve triggered workflows from the automation registry (pure/synchronous)
  let triggered_workflows: string[] | undefined;
  if (eventType) {
    try {
      const runs = matchAutomations(rules, eventType, "", rawPayload as Record<string, any>);
      if (runs.length > 0) {
        // Deduplicate workflow IDs
        triggered_workflows = [...new Set(runs.map((r) => r.workflow))];
      }
    } catch {
      // Silent — don't fail the summary if automation matching errors
    }
  }

  try {
    const parsed = GithubWebhookSummarySchema.parse(rawPayload);
    return { ...parsed, triggered_workflows };
  } catch (error) {
    console.warn("Webhook payload did not match expected summary schema. Attempting safe fallback.", error);

    const result = GithubWebhookSummarySchema.safeParse(rawPayload);
    if (result.success) {
      return { ...result.data, triggered_workflows };
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
      triggered_workflows,
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
