/**
 * @file backend/src/services/stitch/types.ts
 * @description Shared TypeScript types and Zod schemas for the Stitch UX design integration.
 *
 * @module Services/Stitch
 */

import { z } from "zod";

// ─── Device Type ─────────────────────────────────────────────────────────────

export const DeviceType = z.enum(["DESKTOP", "MOBILE", "TABLET"]);
export type DeviceType = z.infer<typeof DeviceType>;

// ─── Generate Screen ─────────────────────────────────────────────────────────

export const GenerateScreenParams = z.object({
  /** Stitch project ID to generate within. */
  projectId: z.string(),
  /** The UX design prompt (already enhanced or raw). */
  prompt: z.string(),
  /** Target device viewport. */
  deviceType: DeviceType.default("DESKTOP"),
});
export type GenerateScreenParams = z.infer<typeof GenerateScreenParams>;

export const GenerateScreenResult = z.object({
  /** Generated screen identifier within the Stitch project. */
  screenId: z.string().optional(),
  /** Raw HTML output from Stitch. */
  html: z.string().optional(),
  /** Alternative field name for HTML code. */
  htmlCode: z.string().optional(),
  /** Any error message from the generation process. */
  error: z.string().optional(),
});
export type GenerateScreenResult = z.infer<typeof GenerateScreenResult>;

// ─── Edit Screens ────────────────────────────────────────────────────────────

export const EditScreensParams = z.object({
  projectId: z.string(),
  screenIds: z.array(z.string()),
  editPrompt: z.string(),
});
export type EditScreensParams = z.infer<typeof EditScreensParams>;

// ─── Get Screen ──────────────────────────────────────────────────────────────

export const GetScreenParams = z.object({
  projectId: z.string(),
  screenId: z.string(),
});
export type GetScreenParams = z.infer<typeof GetScreenParams>;

// ─── Create Project ──────────────────────────────────────────────────────────

export const CreateProjectParams = z.object({
  name: z.string(),
  description: z.string().optional(),
});
export type CreateProjectParams = z.infer<typeof CreateProjectParams>;

// ─── Stitch Loop Workflow ────────────────────────────────────────────────────

export const StitchLoopParams = z.object({
  /** The UI brief / design prompt. */
  prompt: z.string(),
  /** Target repo owner. */
  repoOwner: z.string(),
  /** Target repo name. */
  repoName: z.string(),
  /** Branch to target. Defaults to "main". */
  branch: z.string().default("main"),
  /** Route type determines the target directory for the generated component. */
  routeType: z.enum(["global", "repo"]).default("global"),
  /** Page identifier used for the output filename (e.g. "sentinel-dashboard"). */
  pageId: z.string(),
  /** Stitch project ID. If omitted, uses a default. */
  stitchProjectId: z.string().optional(),
  /** Page structure hints passed to the prompt enhancer. */
  structure: z.array(z.string()).optional(),
});
export type StitchLoopParams = z.infer<typeof StitchLoopParams>;
