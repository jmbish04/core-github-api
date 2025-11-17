/**
 * @file src/utils/openapi.ts
 * @description Utilities for OpenAPI 3.1.0 document generation and YAML conversion
 * @owner AI-Builder
 */

import YAML from "yaml";

/**
 * Convert an OpenAPI JSON document to YAML format
 */
export function convertOpenAPIToYAML(openApiDoc: Record<string, any>): string {
  return YAML.stringify(openApiDoc, {
    indent: 2,
    lineWidth: 0,
    minContentWidth: 0,
  });
}

/**
 * Enhance an OpenAPI 3.0.0 document to 3.1.0 spec
 */
export function enhanceToOpenAPI31(doc: Record<string, any>): Record<string, any> {
  return {
    ...doc,
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      ...doc.info,
      summary: doc.info.summary || "Multi-Protocol Cloudflare Worker",
      description: doc.info.description ||
        "A production-grade Cloudflare Worker supporting REST API, WebSocket, RPC, and MCP protocols.",
      version: doc.info.version || "1.0.0",
      license: {
        name: "MIT",
        identifier: "MIT",
      },
    },
    // This base 'servers' array is here as a default, 
    // but will be overwritten by buildCompleteOpenAPIDocument
    servers: doc.servers || [
      {
        url: "/api",
        description: "REST API Interface",
      }
    ],
    tags: [
      ...(doc.tags || []),
      {
        name: "GitHub",
        description: "GitHub API proxy operations",
      },
      {
        name: "Tools",
        description: "GitHub tool operations (files, issues, PRs)",
      },
      {
        name: "Agents",
        description: "Multi-agent orchestration and sessions",
      },
      {
        name: "System",
        description: "System health and metadata",
      },
    ],
    externalDocs: {
      description: "GitHub Worker Documentation",
      url: "https://github.com/jmbish04/github-worker",
    },
    webhooks: doc.webhooks || {},
  };
}

/**
 * Add security schemes to OpenAPI document
 */
export function addSecuritySchemes(doc: Record<string, any>): Record<string, any> {
  return {
    ...doc,
    components: {
      ...doc.components,
      securitySchemes: {
        // --- MODIFICATION ---
        // Only define one scheme for OpenAI compatibility
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Bearer token for authentication (use your WORKER_API_KEY here)",
        },
        // --- END MODIFICATION ---
      },
    },
    security: [
      // --- MODIFICATION ---
      // Only include the single BearerAuth scheme
      {
        BearerAuth: [],
      },
      // --- END MODIFICATION ---
    ],
  };
}

/**
 * Get system metadata for API responses
 */
export function getSystemMetadata() {
  return {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    protocols: ["REST", "WebSocket", "RPC", "MCP"],
    capabilities: {
      github: {
        repositories: true,
        issues: true,
        pullRequests: true,
        files: true,
        search: true,
      },
      agents: {
        orchestration: true,
        sessions: true,
        workflows: true,
      },
      realtime: {
        websocket: true,
        hibernation: true,
        broadcast: true,
      },
      rpc: {
        serviceBindings: true,
        directInvocation: true,
      },
      mcp: {
        toolListing: true,
        toolExecution: true,
        schemaExport: true,
      },
    },
  };
}

/**
 * Build a complete OpenAPI 3.1.0 document with all enhancements
 */
export function buildCompleteOpenAPIDocument(baseDoc: Record<string, any>, baseUrl: string): Record<string, any> {
  // Start with the base document
  let enhanced = { ...baseDoc };

  // Enhance to 3.1.0
  enhanced = enhanceToOpenAPI31(enhanced);

  // Add security schemes
  enhanced = addSecuritySchemes(enhanced);

  // --- MODIFICATION: ---
  // We ONLY provide the /api server to satisfy the GPT importer.
  // The /mcp and /a2a servers are dropped from the spec.
  enhanced.servers = [
    {
      url: `${baseUrl}/api`,
      description: "API Interface",
    },
  ];
  // --- END MODIFICATION ---

  // Add x-metadata extension
  enhanced["x-metadata"] = getSystemMetadata();

  return enhanced;
}
