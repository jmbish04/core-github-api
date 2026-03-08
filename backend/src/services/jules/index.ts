/**
 * @file backend/src/services/jules/index.ts
 * @description Public API barrel export for the Jules service module.
 *
 * All consumers of the Jules integration (routes, agents, Durable Objects)
 * MUST import from this file using the path alias "@services/jules":
 *
 * ```ts
 * import { JulesService, type JulesEventPayload } from "@services/jules";
 * ```
 *
 * Do NOT import from sub-files directly (e.g. `@services/jules/service`).
 * This barrel is the stable public interface.
 *
 * @module Services/Jules
 */

export { JulesService } from "./service";
export { buildWebhookInstruction } from "./webhook-instruction";
export type {
  StartSessionParams,
  JulesEventType,
  JulesEventPayload,
  JulesStatusPayload,
  JulesLiveMessage,
} from "./types";
