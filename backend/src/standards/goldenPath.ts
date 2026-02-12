export type GoldenPathConfig = {
  frontend: string[];
  backend: string[];
  ai: string[];
  infra: string[];
  docs: string[];
};

export const GOLDEN_PATH_DEFAULTS: GoldenPathConfig = {
  frontend: [
    "Astro frontend served via Worker Assets",
    "React for interactive app surfaces",
    "shadcn/ui with default dark theme",
    "Kibo UI components for dense developer workflows",
    "assistant-ui for in-app copilot experiences",
  ],
  backend: [
    "Hono routing with zod validation",
    "OpenAPI v3.1.0 contract publishing",
    "Drizzle ORM + typed D1 schema for all DB interactions",
  ],
  ai: [
    "agents/ folder with BaseAgent pattern extending Cloudflare Agents SDK",
    "Universal AI service routed through Cloudflare AI Gateway",
    "Default provider worker-ai with @cf/meta/llama-3.3-70b-instruct-fp8-fast",
  ],
  infra: [
    "wrangler.jsonc as deployment source of truth",
    "pnpm-compatible scripts for install/build/deploy",
    "Health service with scheduled reporting to core-github-api",
  ],
  docs: [
    "AGENTS.md guidance for extending BaseAgent",
    "Project-level implementation notes for generated workflows",
  ],
};

export const GOLDEN_PATH_SYSTEM_PROMPT = [
  "Cloudflare Worker Golden Path (strict):",
  "Frontend: Astro + Worker Assets + shadcn/ui (default dark) + Kibo UI + assistant-ui.",
  "Backend: Hono + zod + OpenAPI v3.1.0 + Drizzle ORM for D1 access.",
  "AI: agents/ folder with BaseAgent extension pattern and universal AI gateway integration.",
  "Infra: wrangler.jsonc + pnpm workflows + health service cron reporting to core-github-api.",
  "Docs: maintain AGENTS.md instructions for extending BaseAgent and architecture standards.",
  "Do not suggest stack alternatives unless explicitly requested.",
].join(" ");

export function buildGoldenPathInstructions(customInstructions?: string | null): string {
  const custom = String(customInstructions || "").trim();
  if (!custom) {
    return GOLDEN_PATH_SYSTEM_PROMPT;
  }

  return `${GOLDEN_PATH_SYSTEM_PROMPT} Additional team constraints: ${custom}`;
}

