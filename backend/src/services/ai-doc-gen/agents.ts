import { DurableObject } from "cloudflare:workers";
import {
  createAgent,
  type ObservabilityConfig,
  routeToAgent,
} from "honidev";
import { getCloudflareAccountId, getOpenaiApiKey } from "../../utils/secrets";
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

function asAgentBindings(env: Env) {
  return env as unknown as Record<string, DurableObjectNamespace>;
}

async function buildRuntimeEnv(env: Env) {
  return {
    ...(env as unknown as Record<string, unknown>),
    OPENAI_API_KEY: await getOpenaiApiKey(env),
  };
}

type HoniGatewayObservability = ObservabilityConfig & {
  enabled: boolean;
  aiGatewaySlug: string;
  collectEvents: boolean;
};

async function buildObservability(env: Env, agentName: string): Promise<HoniGatewayObservability> {
  const accountId = await getCloudflareAccountId(env);
  const gatewayId = env.AI_GATEWAY_SLUG || env.AI_GATEWAY_NAME;

  return {
    enabled: true,
    aiGatewaySlug: gatewayId,
    collectEvents: true,
    aiGateway: accountId && gatewayId
      ? {
          accountId,
          gatewayId,
        }
      : undefined,
    logLevel: "debug",
    onEvent: (event) => {
      console.log(`[ai-doc-gen:${agentName}]`, JSON.stringify(event));
    },
  };
}

async function createRuntimeAgent(env: Env, kind: AgentKind) {
  const config = AGENT_CONFIG[kind];
  const runtimeEnv = await buildRuntimeEnv(env);
  const observability = await buildObservability(env, config.name);
  const agent = createAgent({
    name: config.name,
    binding: config.binding,
    model: "gpt-4o",
    system: config.system,
    tools: AI_DOC_TOOLS,
    maxSteps: 12,
    observability,
  });

  return { agent, runtimeEnv };
}

abstract class RuntimeDelegatingAgent extends DurableObject {
  constructor(
    state: DurableObjectState,
    env: Env,
    private readonly kind: AgentKind,
  ) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    const { agent, runtimeEnv } = await createRuntimeAgent(this.env, this.kind);
    const Delegate = agent.DurableObject;
    const delegate = new Delegate(this.ctx, runtimeEnv);
    return delegate.fetch(request);
  }
}

export class AnalyzerAgent extends RuntimeDelegatingAgent {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, "analyzer");
  }
}

export class DocumenterAgent extends RuntimeDelegatingAgent {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, "documenter");
  }
}

export class RulesGeneratorAgent extends RuntimeDelegatingAgent {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, "rules");
  }
}

export async function runAnalyzerAgent(env: Env, threadId: string, prompt: string) {
  const result = await routeToAgent(asAgentBindings(env), {
    binding: ANALYZER_BINDING,
    threadId,
  }, prompt);
  return result.response;
}

export async function runDocumenterAgent(env: Env, threadId: string, prompt: string) {
  const result = await routeToAgent(asAgentBindings(env), {
    binding: DOCUMENTER_BINDING,
    threadId,
  }, prompt);
  return result.response;
}

export async function runRulesGeneratorAgent(env: Env, threadId: string, prompt: string) {
  const result = await routeToAgent(asAgentBindings(env), {
    binding: RULES_BINDING,
    threadId,
  }, prompt);
  return result.response;
}
