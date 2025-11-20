/**
 * Blueprint Generator - Transforms Worker analysis into landing page content
 */

import type { WorkerAnalysis, ContentBlueprint } from './types';

export class BlueprintGenerator {
  /**
   * Generate content blueprint from Worker analysis
   */
  static generate(analysis: WorkerAnalysis): ContentBlueprint {
    return {
      hero: this.generateHero(analysis),
      problem: this.generateProblem(analysis),
      solution: this.generateSolution(analysis),
      features: this.generateFeatures(analysis),
      metrics: this.generateMetrics(analysis),
      useCases: this.generateUseCases(analysis),
      roadmap: this.generateRoadmap(analysis),
      cta: this.generateCTA(analysis),
    };
  }

  private static generateHero(analysis: WorkerAnalysis) {
    return {
      headline: analysis.purpose.headline,
      subheadline: analysis.purpose.valueStatement,
      primaryCTA: {
        text: 'Explore API',
        href: '/openapi.json',
      },
      secondaryCTA: {
        text: 'View Documentation',
        href: '/doc',
      },
      liveStats: analysis.metrics.slice(0, 3).map(m => ({
        value: m.value,
        label: m.label,
      })),
    };
  }

  private static generateProblem(analysis: WorkerAnalysis) {
    return {
      title: 'The Challenge It Solves',
      cards: analysis.painPoints.map(pp => ({
        title: pp.title,
        description: pp.description,
        icon: this.selectProblemIcon(pp.title),
      })),
    };
  }

  private static generateSolution(analysis: WorkerAnalysis) {
    return {
      title: 'How It Works',
      description: this.generateArchitectureDescription(analysis.components),
      architecture: {
        diagram: this.generateArchitectureDiagram(analysis.components),
        components: analysis.components.map(c => ({
          name: c.name,
          description: c.description,
        })),
      },
      highlights: [
        'Edge-first architecture for global performance',
        'Automatic scaling from 0 to millions of requests',
        'Built-in observability and monitoring',
        'Type-safe APIs with automatic validation',
      ],
    };
  }

  private static generateFeatures(analysis: WorkerAnalysis) {
    const featureCards = analysis.painPoints.map(pp => ({
      icon: this.selectFeatureIcon(pp.solution),
      title: pp.solution,
      description: `Solves the "${pp.title}" problem with intelligent automation`,
      tags: this.extractRelevantTags(pp.solution, analysis.techStack),
    }));

    // Add architecture-based features
    if (analysis.components.some(c => c.type === 'Durable Object')) {
      featureCards.push({
        icon: '🔄',
        title: 'Stateful Orchestration',
        description: 'Durable Objects provide strongly consistent, low-latency state management',
        tags: ['Durable Objects', 'WebSocket', 'State'],
      });
    }

    if (analysis.components.some(c => c.type === 'Workers AI')) {
      featureCards.push({
        icon: '🧠',
        title: 'AI-Powered Intelligence',
        description: 'Integrated Cloudflare AI models for natural language processing and analysis',
        tags: ['Workers AI', 'Llama', 'GPT'],
      });
    }

    return {
      title: 'Key Capabilities',
      cards: featureCards.slice(0, 6),
    };
  }

  private static generateMetrics(analysis: WorkerAnalysis) {
    const stats = analysis.metrics.map(m => ({
      value: m.value,
      label: m.label,
      color: (m.trend === 'positive' ? 'emerald' : m.trend === 'negative' ? 'amber' : 'indigo') as 'emerald' | 'indigo' | 'amber',
    }));

    // Add component count if not already present
    if (!stats.some(s => s.label.includes('Component'))) {
      stats.push({
        value: `${analysis.components.length}+`,
        label: 'Architecture Components',
        color: 'indigo',
      });
    }

    return {
      title: 'Performance & Impact',
      stats,
    };
  }

  private static generateUseCases(analysis: WorkerAnalysis) {
    // Generate use cases based on architecture components
    const cases = [];

    if (analysis.components.some(c => c.type === 'Durable Object')) {
      cases.push({
        persona: 'Development Teams',
        scenario: 'Real-time collaboration on GitHub operations with WebSocket rooms',
        outcome: 'Reduced coordination overhead and faster deployment cycles',
      });
    }

    if (analysis.components.some(c => c.type === 'Workers AI')) {
      cases.push({
        persona: 'AI Agents',
        scenario: 'Autonomous repository discovery and intelligent code analysis',
        outcome: 'Automated PR reviews and issue triage at scale',
      });
    }

    if (analysis.components.some(c => c.type === 'Queue')) {
      cases.push({
        persona: 'Enterprise Ops',
        scenario: 'Bulk repository management with async workflow retrofitting',
        outcome: 'Standardized CI/CD across hundreds of repositories',
      });
    }

    // Add generic case if we don't have enough
    if (cases.length < 3) {
      cases.push({
        persona: 'API Consumers',
        scenario: 'Integrate GitHub operations into existing workflows via REST or RPC',
        outcome: 'Reduced integration time from weeks to hours',
      });
    }

    return {
      title: 'Real-World Applications',
      cases: cases.slice(0, 3),
    };
  }

  private static generateRoadmap(analysis: WorkerAnalysis) {
    return {
      title: 'Roadmap',
      milestones: [
        {
          version: 'v1.0',
          title: 'Foundation',
          items: [
            'Multi-protocol API (REST, WebSocket, RPC, MCP)',
            'Durable Objects for orchestration',
            'D1 persistence and audit logging',
          ],
          status: 'completed' as const,
        },
        {
          version: 'v2.0',
          title: 'Intelligence Layer',
          items: [
            'AI-powered repository analysis',
            'Natural language query interface',
            'Automated workflow generation',
          ],
          status: 'in-progress' as const,
        },
        {
          version: 'v3.0',
          title: 'Enterprise Scale',
          items: [
            'Multi-tenant isolation',
            'Advanced RBAC and permissions',
            'SLA monitoring and alerting',
          ],
          status: 'planned' as const,
        },
      ],
    };
  }

  private static generateCTA() {
    return {
      tagline: 'Ready to transform your GitHub workflow?',
      buttons: [
        { text: 'Try the API', href: '/doc', variant: 'primary' as const },
        { text: 'View OpenAPI Spec', href: '/openapi.json', variant: 'secondary' as const },
      ],
    };
  }

  // Helper methods

  private static generateArchitectureDescription(components: import('./types').ArchitectureComponent[]): string {
    const types = new Set(components.map(c => c.type));
    const parts = [];

    if (types.has('Durable Object')) {
      parts.push('Stateful Durable Objects for orchestration');
    }
    if (types.has('D1 Database')) {
      parts.push('D1 for persistent storage');
    }
    if (types.has('Workers AI')) {
      parts.push('Workers AI for intelligent processing');
    }
    if (types.has('Queue')) {
      parts.push('Queues for async workflows');
    }

    return `Edge-first architecture built on ${parts.join(', ')}, delivering global performance with automatic scaling.`;
  }

  private static generateArchitectureDiagram(components: import('./types').ArchitectureComponent[]): string {
    const lines = [];
    lines.push('┌─────────────────────────────────────────┐');
    lines.push('│        Cloudflare Edge Network         │');
    lines.push('└─────────────────┬───────────────────────┘');
    lines.push('                  │');
    lines.push('      ┌───────────▼───────────┐');
    lines.push('      │   Worker (Hono API)   │');
    lines.push('      └───────────┬───────────┘');
    lines.push('                  │');
    lines.push('      ┌───────────┼───────────┐');

    const hasDB = components.some(c => c.type === 'D1 Database');
    const hasDO = components.some(c => c.type === 'Durable Object');
    const hasAI = components.some(c => c.type === 'Workers AI');

    if (hasDO && hasDB) {
      lines.push('      │           │           │');
      lines.push('  ┌───▼───┐   ┌───▼───┐   ┌─▼──┐');
      lines.push('  │  D.O. │   │  D1   │   │ AI │');
      lines.push('  └───────┘   └───────┘   └────┘');
    } else if (hasDO) {
      lines.push('      │           │');
      lines.push('  ┌───▼───┐   ┌───▼───┐');
      lines.push('  │  D.O. │   │  AI   │');
      lines.push('  └───────┘   └───────┘');
    } else {
      lines.push('      │');
      lines.push('  ┌───▼────────┐');
      lines.push('  │  Services  │');
      lines.push('  └────────────┘');
    }

    return lines.join('\n');
  }

  private static selectProblemIcon(title: string): string {
    const icons: Record<string, string> = {
      'integration': '🔌',
      'scalability': '📈',
      'manual': '⚙️',
      'complex': '🧩',
      'slow': '🐌',
      'expensive': '💰',
    };

    const key = Object.keys(icons).find(k => title.toLowerCase().includes(k));
    return icons[key || 'complex'];
  }

  private static selectFeatureIcon(solution: string): string {
    const icons: Record<string, string> = {
      'automated': '🤖',
      'intelligent': '🧠',
      'fast': '⚡',
      'secure': '🔒',
      'scalable': '📊',
      'simple': '✨',
    };

    const key = Object.keys(icons).find(k => solution.toLowerCase().includes(k));
    return icons[key || 'simple'] || '✅';
  }

  private static extractRelevantTags(text: string, techStack: string[]): string[] {
    return techStack.filter(tech =>
      text.toLowerCase().includes(tech.toLowerCase())
    ).slice(0, 3);
  }
}
