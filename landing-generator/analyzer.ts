/**
 * Analyzer Module - Extracts information from Worker codebase
 * Inspects wrangler config, package.json, source files to understand the Worker
 */

import type { WorkerAnalysis, ArchitectureComponent } from './types';

export class WorkerAnalyzer {
  /**
   * Analyze a Worker codebase and extract key information
   */
  static async analyzeWorker(config: {
    wranglerConfig?: any;
    packageJson?: any;
    sourceFiles?: Record<string, string>;
    apiSpec?: any;
  }): Promise<WorkerAnalysis> {
    const { wranglerConfig, packageJson, sourceFiles, apiSpec } = config;

    // Extract architecture components
    const components = this.extractArchitectureComponents(wranglerConfig);

    // Extract features from API spec or source
    const features = this.extractFeatures(apiSpec, sourceFiles);

    // Infer purpose and value proposition
    const purpose = this.inferPurpose(packageJson, apiSpec, components);

    // Extract endpoints
    const endpoints = this.extractEndpoints(apiSpec);

    // Identify pain points and solutions
    const painPoints = this.identifyPainPoints(purpose, features);

    // Extract or infer metrics
    const metrics = this.extractMetrics(components);

    return {
      name: packageJson?.name || wranglerConfig?.name || 'Unknown Worker',
      description: packageJson?.description || 'A Cloudflare Worker',
      purpose,
      components,
      features,
      endpoints,
      painPoints,
      metrics,
      techStack: this.extractTechStack(wranglerConfig, packageJson),
    };
  }

  private static extractArchitectureComponents(config: any): ArchitectureComponent[] {
    const components: ArchitectureComponent[] = [];

    if (!config) return components;

    // Durable Objects
    if (config.durable_objects?.bindings) {
      config.durable_objects.bindings.forEach((binding: any) => {
        components.push({
          type: 'Durable Object',
          name: binding.class_name,
          description: `Stateful object: ${binding.name}`,
          icon: '🔄',
        });
      });
    }

    // D1 Database
    if (config.d1_databases) {
      config.d1_databases.forEach((db: any) => {
        components.push({
          type: 'D1 Database',
          name: db.database_name,
          description: 'SQLite-compatible serverless database',
          icon: '🗄️',
        });
      });
    }

    // KV Namespaces
    if (config.kv_namespaces) {
      config.kv_namespaces.forEach((kv: any) => {
        components.push({
          type: 'KV Namespace',
          name: kv.binding,
          description: 'Low-latency key-value storage',
          icon: '💾',
        });
      });
    }

    // Queues
    if (config.queues?.producers) {
      config.queues.producers.forEach((q: any) => {
        components.push({
          type: 'Queue',
          name: q.queue,
          description: 'Asynchronous message queue',
          icon: '📬',
        });
      });
    }

    // Workflows
    if (config.workflows) {
      config.workflows.forEach((w: any) => {
        components.push({
          type: 'Workflow',
          name: w.name,
          description: 'Durable workflow orchestration',
          icon: '⚡',
        });
      });
    }

    // AI Binding
    if (config.ai) {
      components.push({
        type: 'Workers AI',
        name: 'AI Binding',
        description: 'Cloudflare AI models (Llama, GPT)',
        icon: '🧠',
      });
    }

    return components;
  }

  private static extractFeatures(apiSpec?: any, sourceFiles?: Record<string, string>): string[] {
    const features: string[] = [];

    if (apiSpec?.paths) {
      const pathGroups = new Set<string>();
      Object.keys(apiSpec.paths).forEach(path => {
        const segment = path.split('/')[1];
        if (segment) pathGroups.add(segment);
      });

      pathGroups.forEach(group => {
        features.push(`${group.toUpperCase()} API`);
      });
    }

    return features;
  }

  private static inferPurpose(packageJson?: any, apiSpec?: any, components?: ArchitectureComponent[]): {
    headline: string;
    tagline: string;
    valueStatement: string;
  } {
    // Default fallback
    return {
      headline: packageJson?.description || 'Next-Generation Cloudflare Worker',
      tagline: 'Powered by edge computing',
      valueStatement: 'High-performance, globally distributed serverless application.',
    };
  }

  private static extractEndpoints(apiSpec?: any): Array<{ path: string; method: string; description: string }> {
    if (!apiSpec?.paths) return [];

    const endpoints: Array<{ path: string; method: string; description: string }> = [];

    Object.entries(apiSpec.paths).forEach(([path, methods]: [string, any]) => {
      Object.entries(methods).forEach(([method, details]: [string, any]) => {
        endpoints.push({
          path,
          method: method.toUpperCase(),
          description: details.summary || details.description || '',
        });
      });
    });

    return endpoints.slice(0, 10); // Limit to top 10
  }

  private static identifyPainPoints(purpose: any, features: string[]): Array<{
    title: string;
    description: string;
    solution: string;
  }> {
    // Generic pain points - should be customized per Worker type
    return [
      {
        title: 'Complex Integration',
        description: 'Traditional APIs require extensive boilerplate and configuration',
        solution: 'Simple, type-safe interfaces with automatic validation',
      },
      {
        title: 'Scalability Limits',
        description: 'Monolithic systems struggle under high load',
        solution: 'Edge-native architecture that scales globally',
      },
      {
        title: 'Manual Operations',
        description: 'Repetitive tasks consume developer time',
        solution: 'Automated workflows and intelligent orchestration',
      },
    ];
  }

  private static extractMetrics(components: ArchitectureComponent[]): Array<{
    value: string;
    label: string;
    trend: 'positive' | 'neutral' | 'negative';
  }> {
    return [
      { value: '<50ms', label: 'Response Time', trend: 'positive' },
      { value: '99.99%', label: 'Uptime', trend: 'positive' },
      { value: components.length.toString(), label: 'Architecture Components', trend: 'neutral' },
    ];
  }

  private static extractTechStack(wranglerConfig?: any, packageJson?: any): string[] {
    const stack: string[] = ['Cloudflare Workers'];

    if (wranglerConfig?.durable_objects) stack.push('Durable Objects');
    if (wranglerConfig?.d1_databases) stack.push('D1');
    if (wranglerConfig?.kv_namespaces) stack.push('Workers KV');
    if (wranglerConfig?.queues) stack.push('Queues');
    if (wranglerConfig?.workflows) stack.push('Workflows');
    if (wranglerConfig?.ai) stack.push('Workers AI');

    // Add key dependencies
    if (packageJson?.dependencies) {
      if (packageJson.dependencies.hono) stack.push('Hono');
      if (packageJson.dependencies['@hono/zod-openapi']) stack.push('OpenAPI');
      if (packageJson.dependencies['@octokit/rest']) stack.push('Octokit');
    }

    return stack;
  }
}
