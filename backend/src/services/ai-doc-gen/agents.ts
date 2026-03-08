import {
  createAgent,
  type ObservabilityConfig,
  routeToAgent,
} from "honidev";
import { DEFAULT_WORKERS_AI_MODEL } from "../../ai/providers/config";
import { AI_DOC_TOOLS } from "./tools";

const ANALYZER_BINDING = "ANALYZER_DO";
const DOCUMENTER_BINDING = "DOCUMENTER_DO";
const RULES_BINDING = "RULES_GEN_DO";

const ANALYZER_SYSTEM_PROMPT = `You are the Analyzer agent for an AI documentation generator.

Use the available tools to inspect the repository. Focus on:
- project structure and key directories
- runtime architecture and important integrations
- Hono routes, GitHub workflows, and Cloudflare bindings
- authentication, data storage, and frontend/backend coupling

Return JSON only with this exact shape:
{
  "projectSummary": "string",
  "architectureOverview": "string",
  "keyDirectories": [{ "path": "string", "purpose": "string" }],
  "apiSurface": [{ "name": "string", "details": "string" }],
  "dataFlows": [{ "name": "string", "details": "string" }],
  "dependencies": ["string"],
  "risks": ["string"]
}`;

const DOCUMENTER_SYSTEM_PROMPT = `You are the Documenter agent for an AI documentation generator.

You will receive the Analyzer JSON output as context. Produce architectural markdown documents and return JSON only.

Return JSON only with this exact shape:
{
  "structure_analysis.md": "# ... markdown ...",
  "api_analysis.md": "# ... markdown ..."
}

Each markdown file should be complete, repository-specific, and practical for engineers onboarding to the codebase.`;

const RULES_SYSTEM_PROMPT = `You are the Rules Generator agent for an AI documentation generator.

You will receive the Analyzer JSON output as context. Produce one or more IDE or agent rule files and return JSON only.

Return JSON only with this exact shape:
{
  "repo-doc-gen-rules.md": "# ... markdown ..."
}

Focus on implementation rules that help future agents preserve architecture, safety, and repository conventions.`;

type AgentKind = "analyzer" | "documenter" | "rules";

const AGENT_CONFIG = {
  analyzer: {
    name: "ai-doc-analyzer",
    binding: ANALYZER_BINDING,
    system: ANALYZER_SYSTEM_PROMPT,
  },
  documenter: {
    name: "ai-doc-documenter",
    binding: DOCUMENTER_BINDING,
    system: DOCUMENTER_SYSTEM_PROMPT,
  },
  rules: {
    name: "ai-doc-rules-generator",
    binding: RULES_BINDING,
    system: RULES_SYSTEM_PROMPT,
  },
} as const;

function agentBindingsFromEnv(env: Env) {
  return env as unknown as Record<string, DurableObjectNamespace>;
}

/**
 * Creates the Honi observability config used by a single AI doc generator agent.
 * Debug logging is enabled so agent and tool activity is visible in Worker logs.
 */
function createObservabilityConfig(agentName: string): ObservabilityConfig {
  return {
    logLevel: "debug",
    onEvent: (event) => {
      console.log(`[ai-doc-gen:${agentName}]`, JSON.stringify(event));
    },
  };
}

function createRuntimeAgent(kind: AgentKind) {
  const config = AGENT_CONFIG[kind];
  return createAgent({
    name: config.name,
    binding: config.binding,
    model: DEFAULT_WORKERS_AI_MODEL,
    system: config.system,
    tools: AI_DOC_TOOLS,
    maxSteps: 12,
    observability: createObservabilityConfig(config.name),
  });
}

const analyzerAgent = createRuntimeAgent("analyzer");
const documenterAgent = createRuntimeAgent("documenter");
const rulesGeneratorAgent = createRuntimeAgent("rules");

export const AnalyzerAgent = analyzerAgent.DurableObject;
export const DocumenterAgent = documenterAgent.DurableObject;
export const RulesGeneratorAgent = rulesGeneratorAgent.DurableObject;

export async function runAnalyzerAgent(env: Env, threadId: string, prompt: string) {
  const result = await routeToAgent(agentBindingsFromEnv(env), {
    binding: ANALYZER_BINDING,
    threadId,
  }, prompt);
  return result.response;
}

export async function runDocumenterAgent(env: Env, threadId: string, prompt: string) {
  const result = await routeToAgent(agentBindingsFromEnv(env), {
    binding: DOCUMENTER_BINDING,
    threadId,
  }, prompt);
  return result.response;
}

export async function runRulesGeneratorAgent(env: Env, threadId: string, prompt: string) {
  const result = await routeToAgent(agentBindingsFromEnv(env), {
    binding: RULES_BINDING,
    threadId,
  }, prompt);
  return result.response;
}
