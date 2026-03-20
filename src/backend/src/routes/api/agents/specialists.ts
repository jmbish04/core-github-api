/**
 * @file backend/src/routes/api/agents/specialists.ts
 * @description Serves the dynamic list of specialist agents available in the platform.
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';

const specialistsApi = new OpenAPIHono<{ Bindings: Env }>();

export const SpecialistAgentSchema = z.object({
  id: z.string().describe("The unique identifier (e.g., class name or DO binding) of the agent"),
  name: z.string().describe("Human readable name"),
  subtitle: z.string().describe("Short description of role"),
  icon: z.string().describe("Lucide icon string name to render on the frontend"),
  status: z.enum(["online", "busy", "offline"]).describe("Current status of the agent"),
});

const getSpecialistsRoute = createRoute({
  method: 'get',
  path: '/',
  operationId: 'getSpecialistAgents',
  tags: ['Agents'],
  summary: 'Retrieve all available Specialist Agents',
  responses: {
    200: {
      description: 'List of specialist agents',
      content: {
        'application/json': {
          schema: z.object({
            agents: z.array(SpecialistAgentSchema),
          }),
        },
      },
    },
  },
});

specialistsApi.openapi(getSpecialistsRoute, (c) => {
  // In a production system, this could be driven by D1 or KV.
  // For the Agentic Workshop, we codify the available specialist personas here.
  const agents = [
    {
      id: "CfWorkshop_AgentsSdk",
      name: "CF Agents SDK",
      subtitle: "Cloudflare SDK Expert",
      icon: "Wrench",
      status: "online" as const,
    },
    {
      id: "Orchestrator",
      name: "Orchestrator",
      subtitle: "Multi-agent coordination",
      icon: "Bot",
      status: "busy" as const,
    },
    {
      id: "DBArchitect",
      name: "DB Architect",
      subtitle: "D1 + Drizzle ORM",
      icon: "Database",
      status: "offline" as const,
    },
    {
      id: "ApiEngineer",
      name: "API Engineer",
      subtitle: "Hono + OpenAPI",
      icon: "Globe",
      status: "offline" as const,
    },
    {
      id: "FrontendDev",
      name: "Frontend Dev",
      subtitle: "React + Astro",
      icon: "Palette",
      status: "offline" as const,
    }
  ];

  return c.json({ agents });
});

export default specialistsApi;
