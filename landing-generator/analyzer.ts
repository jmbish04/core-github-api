/**
 * Analyzer Module - Extracts information from Worker codebase
 * Inspects wrangler config, package.json, source files to understand the Worker
 */

import type {
  WorkerAnalysis,
  ArchitectureComponent,
  WranglerConfig,
  PackageJson,
  OpenAPISpec
} from './types';

export class WorkerAnalyzer {
  /**
   * Analyze a Worker codebase and extract key information
   */
  static async analyzeWorker(config: {
    wranglerConfig?: WranglerConfig;
    packageJson?: PackageJson;
    sourceFiles?: Record<string, string>;
    apiSpec?: OpenAPISpec;
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

  private static extractArchitectureComponents(config?: WranglerConfig): ArchitectureComponent[] {
    const components: ArchitectureComponent[] = [];

    if (!config) return components;

    // Durable Objects
    if (config.durable_objects?.bindings) {
      config.durable_objects.bindings.forEach((binding) => {
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
      config.d1_databases.forEach((db) => {
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
      config.kv_namespaces.forEach((kv) => {
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
      config.queues.producers.forEach((q) => {
        components.push({
          type: 'Queue',
          name: q.queue,
          description: 'Asynchronous message queue',
          icon: '📬',
        });
      });
    }

    // Workflows (verified against Cloudflare schema)
    if (config.workflows && Array.isArray(config.workflows)) {
      config.workflows.forEach((w) => {
        // Cloudflare workflows have name, binding, and class_name
        components.push({
          type: 'Workflow',
          name: w.name || w.class_name, // Fallback to class_name if name is missing
          description: 'Durable workflow orchestration',
          icon: '⚡',
        });
      });
    }

    // AI Binding
    if (config.ai) {
      components.push({
        type: 'Workers AI',
        name: config.ai.binding || 'AI',
        description: 'Cloudflare AI models (Llama, GPT)',
        icon: '🧠',
      });
    }

    return components;
  }

  private static extractFeatures(apiSpec?: OpenAPISpec, sourceFiles?: Record<string, string>): string[] {
    const features: string[] = [];

    if (!apiSpec) return features;

    // Prioritize OpenAPI tags if available (more semantic than path segments)
    if (apiSpec.tags && apiSpec.tags.length > 0) {
      apiSpec.tags.forEach(tag => {
        features.push(tag.name);
      });
      return features;
    }

    // Fallback: extract from paths using summaries or first path segment
    if (apiSpec.paths) {
      const featureSet = new Set<string>();

      Object.entries(apiSpec.paths).forEach(([path, methods]) => {
        // Try to extract feature from operation tags or summaries
        Object.values(methods).forEach(operation => {
          if (operation.tags && operation.tags.length > 0) {
            operation.tags.forEach(tag => featureSet.add(tag));
          } else if (operation.summary) {
            // Use summary as feature hint
            featureSet.add(operation.summary.split(' ')[0]); // First word
          }
        });

        // Fallback to path segment only if no tags/summaries found
        if (featureSet.size === 0) {
          const segment = path.split('/').filter(s => s && !s.startsWith('{'))[0];
          if (segment) {
            featureSet.add(segment.charAt(0).toUpperCase() + segment.slice(1));
          }
        }
      });

      features.push(...Array.from(featureSet));
    }

    return features;
  }

  private static inferPurpose(packageJson?: PackageJson, apiSpec?: OpenAPISpec, components?: ArchitectureComponent[]): {
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

  private static extractEndpoints(apiSpec?: OpenAPISpec): Array<{ path: string; method: string; description: string }> {
    if (!apiSpec?.paths) return [];

    const endpoints: Array<{ path: string; method: string; description: string }> = [];

    Object.entries(apiSpec.paths).forEach(([path, methods]) => {
      Object.entries(methods).forEach(([method, details]) => {
        endpoints.push({
          path,
          method: method.toUpperCase(),
          description: details.summary || details.description || '',
        });
      });
    });

    return endpoints.slice(0, 10); // Limit to top 10
  }

  /**
   * Generate generic pain points
   * NOTE: This returns static, generic pain points as a fallback.
   * For production use, override via customAnalysis.painPoints to provide
   * domain-specific problems and solutions.
   */
  private static identifyPainPoints(purpose: unknown, features: string[]): Array<{
    title: string;
    description: string;
    solution: string;
  }> {
    // Generic fallback pain points - should be overridden via customAnalysis
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

  private static extractTechStack(wranglerConfig?: WranglerConfig, packageJson?: PackageJson): string[] {
    const stack: string[] = ['Cloudflare Workers'];

    // Tech map for Wrangler config
    const wranglerTechMap: Array<[keyof WranglerConfig, string]> = [
      ['durable_objects', 'Durable Objects'],
      ['d1_databases', 'D1'],
      ['kv_namespaces', 'Workers KV'],
      ['queues', 'Queues'],
      ['workflows', 'Workflows'],
      ['ai', 'Workers AI'],
    ];

    wranglerTechMap.forEach(([key, label]) => {
      if (wranglerConfig?.[key]) stack.push(label);
    });

    // Dependency map for package.json
    const dependencyMap: Record<string, string> = {
      'hono': 'Hono',
      '@hono/zod-openapi': 'OpenAPI',
      '@octokit/rest': 'Octokit',
      'drizzle-orm': 'Drizzle ORM',
      'kysely': 'Kysely',
      'zod': 'Zod',
    };

    if (packageJson?.dependencies) {
      Object.entries(dependencyMap).forEach(([pkg, label]) => {
        if (packageJson.dependencies![pkg]) stack.push(label);
      });
    }

    return stack;
  }
}
