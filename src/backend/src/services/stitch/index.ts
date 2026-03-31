/**
 * @file backend/src/services/stitch/index.ts
 * @description Public API barrel export for the Stitch UX design service module.
 *
 * All consumers of the Stitch integration MUST import from this file
 * using the path alias "@services/stitch":
 *
 * ```ts
 * import { StitchService, type GenerateScreenParams } from "@services/stitch";
 * ```
 *
 * @module Services/Stitch
 */

export { StitchService } from "./service";
export type {
  GenerateScreenParams,
  GenerateScreenResult,
  EditScreensParams,
  GetScreenParams,
  CreateProjectParams,
  StitchLoopParams,
  DeviceType,
} from "./types";
export {
  DeviceType as DeviceTypeEnum,
  StitchLoopParams as StitchLoopParamsSchema,
} from "./types";
