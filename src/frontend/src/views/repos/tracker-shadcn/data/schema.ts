/**
 * @file data/schema.ts
 * @description Re-exports tracker item schema and type from the API boundary (single source of truth).
 *
 * The canonical Zod schemas live in the Sentinel API types module.
 * This file exists to preserve the local import path for existing consumers.
 */

export { TrackerItemSchema as trackerShadcnSchema } from '@api/routes/api/projects/sentinel/types'
export type { TrackerItem as TrackerShadcnItem } from '@api/routes/api/projects/sentinel/types'
