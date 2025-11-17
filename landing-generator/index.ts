/**
 * Landing Page Generator - Main Entry Point
 *
 * Usage:
 *   import { generateLandingPage } from './landing-generator';
 *   const html = await generateLandingPage({ ... });
 */

import { WorkerAnalyzer } from './analyzer';
import { BlueprintGenerator } from './blueprint';
import { TemplateGenerator } from './template';

export interface GeneratorConfig {
  wranglerConfig?: any;
  packageJson?: any;
  sourceFiles?: Record<string, string>;
  apiSpec?: any;
  customAnalysis?: Partial<import('./types').WorkerAnalysis>;
}

/**
 * Generate a complete landing page HTML from Worker config
 */
export async function generateLandingPage(config: GeneratorConfig): Promise<string> {
  // Step 1: Analyze the Worker
  const analysis = await WorkerAnalyzer.analyzeWorker(config);

  // Merge with custom analysis if provided
  const finalAnalysis = config.customAnalysis
    ? { ...analysis, ...config.customAnalysis }
    : analysis;

  // Step 2: Generate content blueprint
  const blueprint = BlueprintGenerator.generate(finalAnalysis);

  // Step 3: Generate HTML
  const html = TemplateGenerator.generate(blueprint, finalAnalysis.name);

  return html;
}

// Export all modules for direct usage
export { WorkerAnalyzer } from './analyzer';
export { BlueprintGenerator } from './blueprint';
export { TemplateGenerator } from './template';
export * from './types';
