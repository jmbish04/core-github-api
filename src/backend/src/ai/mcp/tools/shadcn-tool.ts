import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Shadcn & Astro Toolset for Cloudflare Agents
 * Handles registry lookups and Astro-specific implementation patterns.
 */
export const registerShadcnTools = (server: McpServer) => {
  
  // 1. Search & Fetch Shadcn Components
  server.tool(
    "get_shadcn_component",
    "Fetches source code for a shadcn component from the official registry",
    { component: z.string().describe("The name of the component, e.g., 'button' or 'dialog'") },
    async ({ component }) => {
      try {
        // Attempting to fetch from the standard shadcn registry endpoint
        const response = await fetch(`https://ui.shadcn.com/registry/styles/new-york/${component}.json`);
        if (!response.ok) throw new Error("Component not found");
        
        const data = await response.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error fetching component: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 2. Astro + Shadcn Implementation Consultant
  server.tool(
    "consult_astro_frontend",
    "Provides best practices for implementing Shadcn (React) within Astro on Cloudflare",
    { 
      pattern: z.enum(["hydration", "styling", "deployment"]),
      componentName: z.string().optional() 
    },
    async ({ pattern, componentName }) => {
      const guidelines = {
        hydration: `In Astro, Shadcn (React) components require client directives. Use <${componentName || 'Component'} client:load /> for interactive elements or client:visible for footer/below-the-fold UI.`,
        styling: "Ensure 'lucide-react' is installed. Tailwind must be configured in astro.config.mjs. Check that your @/lib/utils.ts matches shadcn's expected cn() helper.",
        deployment: "When deploying to Cloudflare Workers Assets, ensure SSR is enabled in Astro. Use the @astrojs/cloudflare adapter."
      };

      return {
        content: [{ type: "text", text: guidelines[pattern] }]
      };
    }
  );
};
