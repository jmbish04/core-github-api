export * from "./types";
export * from "./service";
export * from "./analyzer";
export * from "./blueprint";
export * from "./template";
export * from "./cloudflareBindings";

import { LandingGeneratorService } from "./service";
import type { GeneratorConfig } from "./types";

/**
 * Adapter for legacy/functional usage (e.g. projects API)
 */
export async function generateLandingPage(config: GeneratorConfig): Promise<string> {
    return LandingGeneratorService.generateHtml(config);
}
