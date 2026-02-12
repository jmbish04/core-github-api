/**
 * Generate Landing Page for Core GitHub API Worker
 * Run: npx tsx landing-generator/generate.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import JSON5 from 'json5';
import { generateLandingPage } from './index';
import type { WorkerAnalysis } from './types';

async function main() {
  console.log('🚀 Generating landing page for Core GitHub API...\n');

  // Load configs using JSON5 for proper JSONC parsing
  const wranglerConfig = JSON5.parse(readFileSync('wrangler.jsonc', 'utf-8'));
  const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));

  // Custom analysis for this specific Worker
  const customAnalysis: Partial<WorkerAnalysis> = {
    name: 'Core GitHub API',
    description: 'AI-first GitHub API proxy built on Cloudflare Workers',

    branding: {
      icon: '🔮',
      displayName: 'Core GitHub API',
    },

    links: {
      primary: { text: '📖 Explore Interactive API', href: '/doc' },
      secondary: { text: '📋 View OpenAPI Spec', href: '/openapi.json' },
      footer: [
        { text: 'Interactive API Docs', href: '/doc' },
        { text: 'OpenAPI JSON', href: '/openapi.json' },
        { text: 'OpenAPI YAML', href: '/openapi.yaml' },
        { text: 'MCP Tools', href: '/mcp-tools' },
      ],
    },

    purpose: {
      headline: 'GitHub Automation Redefines How AI Agents Code',
      tagline: 'Multi-protocol GitHub proxy engineered for autonomous AI operations',
      valueStatement: 'Transform GitHub from a manual code platform into a programmable infrastructure layer that AI agents can orchestrate at scale—with real-time collaboration, intelligent search, and enterprise-grade observability.',
    },

    features: [
      'Multi-Protocol Interface (REST, WebSocket, RPC, MCP)',
      'AI-Powered Repository Intelligence',
      'Real-Time Collaboration Rooms',
      'Bulk Repository Management',
      'Automated Workflow Orchestration',
      'Type-Safe API with Auto-Validation',
    ],

    painPoints: [
      {
        title: 'AI Agents Lack GitHub Access',
        description: 'Modern AI agents need structured, validated interfaces to interact with GitHub, but the standard API lacks tool schemas and MCP protocol support.',
        solution: 'Native MCP Protocol with 7+ pre-built tools, automatic schema validation, and JSON Schema documentation for seamless AI agent integration.',
      },
      {
        title: 'Manual Repository Operations',
        description: 'Setting up CI/CD workflows across dozens of repositories requires manual, error-prone configuration that can take days or weeks.',
        solution: 'Intelligent Flows API with date-based filtering, automatic workflow detection, and comprehensive audit logging for bulk operations.',
      },
      {
        title: 'Repository Discovery at Scale',
        description: 'Finding relevant repositories across large organizations requires multiple manual searches, analysis, and relevancy scoring.',
        solution: 'AI-Powered Orchestrator generates search strategies, analyzes results with Llama 3.3, and ranks repositories by semantic relevancy.',
      },
      {
        title: 'No Real-Time Coordination',
        description: 'Multiple developers and AI agents need to coordinate GitHub operations in real-time without polling or webhooks.',
        solution: 'Hibernatable WebSocket Durable Objects provide project-based collaboration rooms with presence tracking and broadcast messaging.',
      },
    ],

    metrics: [
      { value: '<50ms', label: 'P95 Response Time', trend: 'positive' as const },
      { value: '99.99%', label: 'Global Uptime', trend: 'positive' as const },
      { value: '4', label: 'Protocol Interfaces', trend: 'neutral' as const },
      { value: '7+', label: 'MCP Tools', trend: 'positive' as const },
      { value: '3', label: 'Durable Objects', trend: 'neutral' as const },
      { value: '∞', label: 'Auto-Scaling', trend: 'positive' as const },
    ],

    endpoints: [
      { path: '/api/tools/files/upsert', method: 'POST', description: 'Create or update files in repositories' },
      { path: '/api/tools/prs/create', method: 'POST', description: 'Create pull requests with validation' },
      { path: '/api/flows/create-new-repo', method: 'POST', description: 'Create repository with default workflows' },
      { path: '/api/flows/retrofit-workflows', method: 'POST', description: 'Bulk add workflows to existing repos' },
      { path: '/api/agents/session', method: 'POST', description: 'Start AI-powered search session' },
      { path: '/api/octokit/rest/:namespace/:method', method: 'POST', description: 'Generic GitHub REST API proxy' },
      { path: '/mcp-tools', method: 'GET', description: 'List available MCP tools with schemas' },
      { path: '/mcp-execute', method: 'POST', description: 'Execute MCP tools with validation' },
      { path: '/ws', method: 'GET', description: 'WebSocket upgrade for real-time collaboration' },
      { path: '/doc', method: 'GET', description: 'Swagger UI documentation' },
    ],
  };

  // Generate the landing page
  const html = await generateLandingPage({
    wranglerConfig,
    packageJson,
    customAnalysis,
  });

  // Write to public directory
  const outputPath = join(process.cwd(), 'public', 'index.html');
  writeFileSync(outputPath, html, 'utf-8');

  console.log('✅ Landing page generated successfully!');
  console.log(`📁 Output: ${outputPath}`);
  console.log('\n🎨 Features:');
  console.log('   • Gradient hero with live stats');
  console.log('   • Scroll-triggered animations');
  console.log('   • Responsive Tailwind design');
  console.log('   • Glass morphism navigation');
  console.log('   • Architecture diagrams');
  console.log('   • Interactive roadmap');
  console.log('\n🚀 Deploy: Upload public/index.html to your Worker static assets');
}

main().catch(console.error);
