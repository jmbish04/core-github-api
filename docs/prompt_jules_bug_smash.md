Please open a new branch named jules-bug-smash and commit all the current code 

then open a session with jules using your mcp tool with a prompt grouping all of the tsc --noEmit and ide problems tab by type and provide instructions for jules to fix 

@current_problems 

backend/src/ai/agents/base/BaseAgent.ts(26,3): error TS2578: Unused '@ts-expect-error' directive.
backend/src/ai/agents/base/BaseAgent.ts(87,24): error TS2722: Cannot invoke an object which is possibly 'undefined'.
backend/src/ai/agents/base/BaseAgent.ts(87,25): error TS2352: Conversion of type 'TEnv' to type 'Record<string, { get?: (() => Promise<string>) | undefined; }>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type 'Env' is not comparable to type 'Record<string, { get?: (() => Promise<string>) | undefined; }>'.
    Index signature for type 'string' is missing in type 'Env'.
backend/src/ai/agents/base/BaseAgent.ts(90,24): error TS2722: Cannot invoke an object which is possibly 'undefined'.
backend/src/ai/agents/base/BaseAgent.ts(90,25): error TS2352: Conversion of type 'TEnv' to type 'Record<string, { get?: (() => Promise<string>) | undefined; }>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type 'Env' is not comparable to type 'Record<string, { get?: (() => Promise<string>) | undefined; }>'.
    Index signature for type 'string' is missing in type 'Env'.
backend/src/ai/agents/base/BaseAgent.ts(93,24): error TS2722: Cannot invoke an object which is possibly 'undefined'.
backend/src/ai/agents/base/BaseAgent.ts(93,25): error TS2352: Conversion of type 'TEnv' to type 'Record<string, { get?: (() => Promise<string>) | undefined; }>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type 'Env' is not comparable to type 'Record<string, { get?: (() => Promise<string>) | undefined; }>'.
    Index signature for type 'string' is missing in type 'Env'.
backend/src/ai/agents/base/BaseAgent.ts(113,23): error TS2532: Object is possibly 'undefined'.
backend/src/ai/agents/base/BaseAgent.ts(113,23): error TS2722: Cannot invoke an object which is possibly 'undefined'.
backend/src/ai/agents/base/BaseAgent.ts(135,23): error TS2532: Object is possibly 'undefined'.
backend/src/ai/agents/base/BaseAgent.ts(135,23): error TS2722: Cannot invoke an object which is possibly 'undefined'.
backend/src/ai/agents/base/HonoBaseAgent.ts(11,41): error TS2558: Expected 0 type arguments, but got 1.
backend/src/ai/agents/base/HonoBaseAgent.ts(30,41): error TS2345: Argument of type 'Request<unknown, CfProperties<unknown>>' is not assignable to parameter of type 'Request<unknown, IncomingRequestCfProperties<unknown>>'.
  Type 'CfProperties<unknown>' is not assignable to type 'IncomingRequestCfProperties<unknown>'.
    Type 'RequestInitCfProperties' is not assignable to type 'IncomingRequestCfProperties<unknown>'.
      Type 'RequestInitCfProperties' is missing the following properties from type 'IncomingRequestCfPropertiesBase': colo, edgeRequestKeepAliveStatus, httpProtocol, requestPriority, and 2 more.
backend/src/ai/agents/base/patterns/evaluator-optimizer.ts(1,37): error TS2307: Cannot find module '@openai/agents' or its corresponding type declarations.
backend/src/ai/agents/base/patterns/evaluator-optimizer.ts(53,52): error TS2307: Cannot find module '@openai/agents' or its corresponding type declarations.
backend/src/ai/agents/base/patterns/evaluator-optimizer.ts(73,12): error TS2551: Property 'setState' does not exist on type 'EvaluatorOptimizerAgent'. Did you mean 'setStatus'?
backend/src/ai/agents/base/patterns/evaluator-optimizer.ts(101,14): error TS2551: Property 'setState' does not exist on type 'EvaluatorOptimizerAgent'. Did you mean 'setStatus'?
backend/src/ai/agents/base/patterns/evaluator-optimizer.ts(105,16): error TS2551: Property 'setState' does not exist on type 'EvaluatorOptimizerAgent'. Did you mean 'setStatus'?
backend/src/ai/agents/base/patterns/evaluator-optimizer.ts(118,12): error TS2551: Property 'setState' does not exist on type 'EvaluatorOptimizerAgent'. Did you mean 'setStatus'?
backend/src/ai/agents/base/patterns/orchestrator-workers.ts(49,52): error TS2307: Cannot find module '@openai/agents' or its corresponding type declarations.
backend/src/ai/agents/base/patterns/orchestrator-workers.ts(77,12): error TS2551: Property 'setState' does not exist on type 'OrchestratorWorkersAgent'. Did you mean 'setStatus'?
backend/src/ai/agents/base/patterns/orchestrator-workers.ts(101,12): error TS2551: Property 'setState' does not exist on type 'OrchestratorWorkersAgent'. Did you mean 'setStatus'?
backend/src/ai/agents/base/patterns/parallelization.ts(21,36): error TS2315: Type 'Agent' is not generic.
backend/src/ai/agents/base/patterns/parallelization.ts(25,41): error TS2307: Cannot find module '@openai/agents' or its corresponding type declarations.
backend/src/ai/agents/base/patterns/routing.ts(36,41): error TS2307: Cannot find module '@openai/agents' or its corresponding type declarations.
backend/src/ai/agents/CloudflareDocs.backup.ts(176,42): error TS2315: Type 'HonoBaseAgent' is not generic.
backend/src/ai/agents/CloudflareDocs.backup.ts(185,5): error TS2353: Object literal may only specify known properties, and 'repoContext' does not exist in type 'BaseAgentState'.
backend/src/ai/agents/CloudflareDocs.backup.ts(198,32): error TS2339: Property 'env' does not exist on type 'CloudflareDocsAgent'.
backend/src/ai/agents/CloudflareDocs.ts(67,5): error TS2353: Object literal may only specify known properties, and 'repoContext' does not exist in type 'BaseAgentState'.
backend/src/ai/agents/DeepReasoning.ts(5,16): error TS2339: Property 'Agent' does not exist on type '{ fetch: ExportedHandlerFetchHandler<unknown, unknown>; DurableObject: new (ctx: DurableObjectState<unknown>, env: unknown) => { memory: ThreadMemory; ... 5 more ...; fetch(request: Request<...>): Promise<...>; }; }'.
backend/src/ai/agents/DeepReasoning.ts(5,23): error TS2339: Property 'handler' does not exist on type '{ fetch: ExportedHandlerFetchHandler<unknown, unknown>; DurableObject: new (ctx: DurableObjectState<unknown>, env: unknown) => { memory: ThreadMemory; ... 5 more ...; fetch(request: Request<...>): Promise<...>; }; }'.
backend/src/ai/agents/DeepReasoning.ts(5,47): error TS2558: Expected 0 type arguments, but got 1.
backend/src/ai/agents/Gemini.ts(12,33): error TS2561: Object literal may only specify known properties, but 'dbBinding' does not exist in type 'EpisodicConfig'. Did you mean to write 'binding'?
backend/src/ai/agents/Gemini.ts(14,20): error TS2353: Object literal may only specify known properties, and 'enabled' does not exist in type 'ObservabilityConfig'.
backend/src/ai/agents/Gemini.ts(24,41): error TS2345: Argument of type 'Request<unknown, CfProperties<unknown>>' is not assignable to parameter of type 'Request<unknown, IncomingRequestCfProperties<unknown>>'.
  Type 'CfProperties<unknown>' is not assignable to type 'IncomingRequestCfProperties<unknown>'.
    Type 'RequestInitCfProperties' is not assignable to type 'IncomingRequestCfProperties<unknown>'.
      Type 'RequestInitCfProperties' is missing the following properties from type 'IncomingRequestCfPropertiesBase': colo, edgeRequestKeepAliveStatus, httpProtocol, requestPriority, and 2 more.
backend/src/ai/agents/github/Owner.ts(180,14): error TS2551: Property 'setState' does not exist on type 'OwnerAgent'. Did you mean 'setStatus'?
backend/src/ai/agents/github/Owner.ts(184,10): error TS2551: Property 'setState' does not exist on type 'OwnerAgent'. Did you mean 'setStatus'?
backend/src/ai/agents/github/Owner.ts(448,12): error TS2551: Property 'setState' does not exist on type 'OwnerAgent'. Did you mean 'setStatus'?
backend/src/ai/agents/github/Repo.ts(8,10): error TS2305: Module '"agents"' has no exported member 'getAgentByName'.
backend/src/ai/agents/github/Repo.ts(8,26): error TS2305: Module '"agents"' has no exported member 'routeAgentRequest'.
backend/src/ai/agents/github/Repo.ts(305,10): error TS2551: Property 'setState' does not exist on type 'RepoAgent'. Did you mean 'setStatus'?
backend/src/ai/agents/github/Repo.ts(608,10): error TS2551: Property 'setState' does not exist on type 'RepoAgent'. Did you mean 'setStatus'?
backend/src/ai/agents/health.ts(2,10): error TS2305: Module '"agents"' has no exported member 'getAgentByName'.
backend/src/ai/agents/HealthDiagnostician.ts(59,16): error TS2722: Cannot invoke an object which is possibly 'undefined'.
backend/src/ai/agents/implementer.ts(7,38): error TS2307: Cannot find module '../types' or its corresponding type declarations.
backend/src/ai/agents/implementer.ts(8,36): error TS2307: Cannot find module '../router' or its corresponding type declarations.
backend/src/ai/agents/implementer.ts(9,29): error TS2307: Cannot find module '../auditor' or its corresponding type declarations.
backend/src/ai/agents/JulesOverseer.ts(43,14): error TS2722: Cannot invoke an object which is possibly 'undefined'.
backend/src/ai/agents/LandingPageAgent.ts(26,16): error TS2339: Property 'Agent' does not exist on type '{ fetch: ExportedHandlerFetchHandler<unknown, unknown>; DurableObject: new (ctx: DurableObjectState<unknown>, env: unknown) => { memory: ThreadMemory; ... 5 more ...; fetch(request: Request<...>): Promise<...>; }; }'.
backend/src/ai/agents/LandingPageAgent.ts(26,23): error TS2339: Property 'handler' does not exist on type '{ fetch: ExportedHandlerFetchHandler<unknown, unknown>; DurableObject: new (ctx: DurableObjectState<unknown>, env: unknown) => { memory: ThreadMemory; ... 5 more ...; fetch(request: Request<...>): Promise<...>; }; }'.
backend/src/ai/agents/LandingPageAgent.ts(26,47): error TS2558: Expected 0 type arguments, but got 1.
backend/src/ai/agents/Orchestrator.ts(12,20): error TS2305: Module '"agents"' has no exported member 'getAgentByName'.
backend/src/ai/agents/Planner.ts(17,16): error TS2339: Property 'Agent' does not exist on type '{ fetch: ExportedHandlerFetchHandler<unknown, unknown>; DurableObject: new (ctx: DurableObjectState<unknown>, env: unknown) => { memory: ThreadMemory; ... 5 more ...; fetch(request: Request<...>): Promise<...>; }; }'.
backend/src/ai/agents/Planner.ts(17,23): error TS2339: Property 'handler' does not exist on type '{ fetch: ExportedHandlerFetchHandler<unknown, unknown>; DurableObject: new (ctx: DurableObjectState<unknown>, env: unknown) => { memory: ThreadMemory; ... 5 more ...; fetch(request: Request<...>): Promise<...>; }; }'.
backend/src/ai/agents/Planner.ts(17,47): error TS2558: Expected 0 type arguments, but got 1.
backend/src/ai/agents/Research.ts(6,16): error TS2339: Property 'Agent' does not exist on type '{ fetch: ExportedHandlerFetchHandler<unknown, unknown>; DurableObject: new (ctx: DurableObjectState<unknown>, env: unknown) => { memory: ThreadMemory; ... 5 more ...; fetch(request: Request<...>): Promise<...>; }; }'.
backend/src/ai/agents/Research.ts(6,23): error TS2339: Property 'handler' does not exist on type '{ fetch: ExportedHandlerFetchHandler<unknown, unknown>; DurableObject: new (ctx: DurableObjectState<unknown>, env: unknown) => { memory: ThreadMemory; ... 5 more ...; fetch(request: Request<...>): Promise<...>; }; }'.
backend/src/ai/agents/Research.ts(6,47): error TS2558: Expected 0 type arguments, but got 1.
backend/src/ai/agents/Research.ts(28,7): error TS2554: Expected 1 arguments, but got 4.
backend/src/ai/agents/Research.ts(34,14): error TS7006: Parameter 'params' implicitly has an 'any' type.
backend/src/ai/agents/Research.ts(34,22): error TS7006: Parameter 'ctx' implicitly has an 'any' type.
backend/src/ai/agents/ResearchOrchestrator.ts(14,80): error TS2307: Cannot find module 'agents/workflows' or its corresponding type declarations.
backend/src/ai/agents/ResearchOrchestrator.ts(40,36): error TS2307: Cannot find module '@openai/agents' or its corresponding type declarations.
backend/src/ai/agents/ResearchOrchestrator.ts(41,13): error TS2339: Property 'createRunner' does not exist on type 'typeof import("/Volumes/Projects/workers/core-github-api/backend/src/ai/agents/base/agent-ai")'.
backend/src/ai/agents/ResearchOrchestrator.ts(53,44): error TS2339: Property 'env' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(68,29): error TS2339: Property 'env' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(85,16): error TS2339: Property 'reportProgress' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(143,29): error TS2339: Property 'env' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(170,31): error TS2339: Property 'env' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(177,18): error TS2339: Property 'reportProgress' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(186,35): error TS2339: Property 'waitForApproval' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(195,29): error TS2339: Property 'env' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(202,16): error TS2339: Property 'reportProgress' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(207,54): error TS7006: Parameter 'candidate' implicitly has an 'any' type.
backend/src/ai/agents/ResearchOrchestrator.ts(215,16): error TS2339: Property 'reportProgress' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(220,49): error TS7006: Parameter 'analysis' implicitly has an 'any' type.
backend/src/ai/agents/ResearchOrchestrator.ts(232,39): error TS2339: Property 'env' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(237,20): error TS2339: Property 'env' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(255,29): error TS2339: Property 'env' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(282,45): error TS2339: Property 'env' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(309,45): error TS2339: Property 'env' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(352,27): error TS2339: Property 'env' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/ResearchOrchestrator.ts(427,27): error TS2339: Property 'env' does not exist on type 'ResearchOrchestrator'.
backend/src/ai/agents/Supervisor.ts(7,16): error TS2339: Property 'Agent' does not exist on type '{ fetch: ExportedHandlerFetchHandler<unknown, unknown>; DurableObject: new (ctx: DurableObjectState<unknown>, env: unknown) => { memory: ThreadMemory; ... 5 more ...; fetch(request: Request<...>): Promise<...>; }; }'.
backend/src/ai/agents/Supervisor.ts(7,23): error TS2339: Property 'handler' does not exist on type '{ fetch: ExportedHandlerFetchHandler<unknown, unknown>; DurableObject: new (ctx: DurableObjectState<unknown>, env: unknown) => { memory: ThreadMemory; ... 5 more ...; fetch(request: Request<...>): Promise<...>; }; }'.
backend/src/ai/agents/Supervisor.ts(7,47): error TS2558: Expected 0 type arguments, but got 1.
backend/src/ai/agents/Supervisor.ts(35,20): error TS4112: This member cannot have an 'override' modifier because its containing class 'Supervisor' does not extend another class.
backend/src/ai/agents/Supervisor.ts(78,58): error TS2339: Property 'env' does not exist on type 'Supervisor'.
backend/src/ai/agents/Supervisor.ts(79,57): error TS2339: Property 'env' does not exist on type 'Supervisor'.
backend/src/ai/agents/Supervisor.ts(90,24): error TS2339: Property 'ctx' does not exist on type 'Supervisor'.
backend/src/ai/agents/Supervisor.ts(166,20): error TS2339: Property 'ctx' does not exist on type 'Supervisor'.
backend/src/ai/agents/Supervisor.ts(167,20): error TS2339: Property 'ctx' does not exist on type 'Supervisor'.
backend/src/ai/agents/Supervisor.ts(168,43): error TS2339: Property 'ctx' does not exist on type 'Supervisor'.
backend/src/ai/agents/TopicOrchestrator.ts(56,10): error TS2551: Property 'setState' does not exist on type 'TopicOrchestratorAgent'. Did you mean 'setStatus'?
backend/src/ai/agents/workshop/CfAgentsSdk.ts(126,5): error TS2353: Object literal may only specify known properties, and 'repoContext' does not exist in type 'WorkshopAgentState'.
backend/src/ai/agents/workshop/WorkshopAgent.ts(16,36): error TS2315: Type 'HonoBaseAgent' is not generic.
backend/src/ai/agents/workshop/WorkshopAgent.ts(48,10): error TS2339: Property 'logger' does not exist on type 'WorkshopAgent'.
backend/src/ai/agents/workshop/WorkshopAgent.ts(56,10): error TS2339: Property 'logger' does not exist on type 'WorkshopAgent'.
backend/src/ai/agents/workshop/WorkshopAgent.ts(60,27): error TS2339: Property 'env' does not exist on type 'WorkshopAgent'.
backend/src/ai/agents/workshop/WorkshopAgent.ts(69,69): error TS2339: Property 'env' does not exist on type 'WorkshopAgent'.
backend/src/ai/agents/workshop/WorkshopAgent.ts(217,27): error TS2339: Property 'env' does not exist on type 'WorkshopAgent'.
backend/src/ai/mcp/tools/github/git-sandbox-health.ts(83,40): error TS2345: Argument of type 'DurableObjectNamespace<undefined>' is not assignable to parameter of type 'DurableObjectNamespace<Sandbox<any>>'.
  The types returned by 'get(...)' are incompatible between these types.
    Type 'DurableObjectStub<undefined>' is not assignable to type 'DurableObjectStub<Sandbox<any>>'.
      Type 'DurableObjectStub<undefined>' is missing the following properties from type 'Pick<{ defaultPort: Promise<number>; sleepAfter: Promise<number> | Promise<string>; client: Promise<{ readonly backup: { createArchive: Stub<(dir: string, archivePath: string, sessionId: string) => Promise<...>>; restoreArchive: Stub<...>; setRetryTimeoutMs: Stub<...>; }; ... 13 more ...; disconnect: Stub<...>; } & ...': watch, [Rpc.__DURABLE_OBJECT_BRAND], start, entrypoint, and 69 more.
backend/src/ai/providers/anthropic.ts(12,40): error TS2724: '"../utils/gateway-client"' has no exported member named 'createUniversalGatewayRunner'. Did you mean 'createUniversalGatewayClient'?
backend/src/ai/providers/anthropic.ts(16,29): error TS2307: Cannot find module '@openai/agents' or its corresponding type declarations.
backend/src/ai/providers/gemini.ts(13,40): error TS2724: '"../utils/gateway-client"' has no exported member named 'createUniversalGatewayRunner'. Did you mean 'createUniversalGatewayClient'?
backend/src/ai/providers/gemini.ts(16,29): error TS2307: Cannot find module '@openai/agents' or its corresponding type declarations.
backend/src/ai/providers/openai.ts(11,40): error TS2724: '"../utils/gateway-client"' has no exported member named 'createUniversalGatewayRunner'. Did you mean 'createUniversalGatewayClient'?
backend/src/ai/providers/openai.ts(15,29): error TS2307: Cannot find module '@openai/agents' or its corresponding type declarations.
backend/src/automations/issues/SlashCommand.ts(3,36): error TS2307: Cannot find module '@/automations/push/gardener/router' or its corresponding type declarations.
backend/src/automations/push/auditor.ts(7,34): error TS2307: Cannot find module './types' or its corresponding type declarations.
backend/src/automations/push/commands/extract.ts(1,46): error TS2307: Cannot find module './types' or its corresponding type declarations.
backend/src/automations/push/commands/registry.ts(1,46): error TS2307: Cannot find module './types' or its corresponding type declarations.
backend/src/automations/push/commands/registry.ts(2,33): error TS2307: Cannot find module './fix-types' or its corresponding type declarations.
backend/src/automations/push/commands/registry.ts(3,31): error TS2307: Cannot find module './fix-all' or its corresponding type declarations.
backend/src/automations/push/commands/registry.ts(4,41): error TS2307: Cannot find module './resolve-conflicts' or its corresponding type declarations.
backend/src/automations/push/commands/registry.ts(5,34): error TS2307: Cannot find module './implement' or its corresponding type declarations.
backend/src/automations/push/commands/standardize.ts(1,46): error TS2307: Cannot find module './types' or its corresponding type declarations.
backend/src/automations/push/commands/standardize.ts(8,16): error TS7006: Parameter 'args' implicitly has an 'any' type.
backend/src/automations/push/commands/standardize.ts(8,22): error TS7006: Parameter 'ctx' implicitly has an 'any' type.
backend/src/automations/push/commands/standardize.ts(8,27): error TS7006: Parameter 'metadata' implicitly has an 'any' type.
backend/src/automations/push/commands/test.ts(1,46): error TS2307: Cannot find module './types' or its corresponding type declarations.
backend/src/automations/push/commands/test.ts(2,29): error TS2307: Cannot find module '../agents/implementer' or its corresponding type declarations.
backend/src/automations/push/commands/test.ts(7,16): error TS7006: Parameter 'args' implicitly has an 'any' type.
backend/src/automations/push/commands/test.ts(7,22): error TS7006: Parameter 'ctx' implicitly has an 'any' type.
backend/src/automations/push/commands/test.ts(7,27): error TS7006: Parameter '_metadata' implicitly has an 'any' type.
backend/src/automations/push/gardener/commands/fix-all.ts(2,34): error TS2307: Cannot find module '../ops/container-manager' or its corresponding type declarations.
backend/src/automations/push/gardener/commands/implement.ts(2,29): error TS2307: Cannot find module '../agents/implementer' or its corresponding type declarations.
backend/src/automations/push/gardener/commands/resolve-conflicts.ts(2,34): error TS2307: Cannot find module '../ops/container-manager' or its corresponding type declarations.
backend/src/automations/push/GardenerPush.ts(3,38): error TS2307: Cannot find module '@/automations/push/gardener' or its corresponding type declarations.
backend/src/automations/push/ops/container.ts(6,38): error TS2307: Cannot find module '../types' or its corresponding type declarations.
backend/src/automations/push/orchestrator.ts(11,33): error TS2307: Cannot find module './fixers/worker-type-fixer' or its corresponding type declarations.
backend/src/automations/push/orchestrator.ts(12,51): error TS2307: Cannot find module './types' or its corresponding type declarations.
backend/src/automations/push/orchestrator.ts(18,39): error TS2307: Cannot find module './RepoSpecialistBuilder' or its corresponding type declarations.
backend/src/automations/push/router.ts(7,38): error TS2307: Cannot find module './types' or its corresponding type declarations.
backend/src/automations/repository/standardization/rules.ts(1,28): error TS2307: Cannot find module './octokit/core' or its corresponding type declarations.
backend/src/index.ts(3,30): error TS2307: Cannot find module '@scalar/hono-api-reference' or its corresponding type declarations.
backend/src/index.ts(5,34): error TS2307: Cannot find module 'agents/mcp' or its corresponding type declarations.
backend/src/index.ts(60,10): error TS2769: No overload matches this call.
  Overload 1 of 6, '(name: string, description: string, paramsSchemaOrAnnotations: { title?: string | undefined; readOnlyHint?: boolean | undefined; destructiveHint?: boolean | undefined; idempotentHint?: boolean | undefined; openWorldHint?: boolean | undefined; } | { ...; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Argument of type '({ targetServer, toolName, parameters }: ShapeOutput<{ targetServer: ZodEnum<{ "cloudflare-docs": "cloudflare-docs"; StitchMCP: "StitchMCP"; }>; toolName: ZodString; parameters: ZodRecord<ZodAny, SomeType>; }>) => Promise<...>' is not assignable to parameter of type '(args: ShapeOutput<{ targetServer: ZodEnum<{ "cloudflare-docs": "cloudflare-docs"; StitchMCP: "StitchMCP"; }>; toolName: ZodString; parameters: ZodRecord<ZodAny, SomeType>; }>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>'.
      Type 'Promise<{ content: {}; isError?: undefined; } | { isError: true; content: { type: "text"; text: string; }[]; }>' is not assignable to type '{ [x: string]: unknown; content: ({ type: "text"; text: string; annotations?: { audience?: ("user" | "assistant")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; })[]; _meta?: { ...; } | undefine...'.
        Type 'Promise<{ content: {}; isError?: undefined; } | { isError: true; content: { type: "text"; text: string; }[]; }>' is not assignable to type 'Promise<{ [x: string]: unknown; content: ({ type: "text"; text: string; annotations?: { audience?: ("user" | "assistant")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; })[]; _meta?: { ...; } | ...'.
          Type '{ content: {}; isError?: undefined; } | { isError: true; content: { type: "text"; text: string; }[]; }' is not assignable to type '{ [x: string]: unknown; content: ({ type: "text"; text: string; annotations?: { audience?: ("user" | "assistant")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; })[]; _meta?: { ...; } | undefine...'.
            Type '{ content: {}; isError?: undefined; }' is not assignable to type '{ [x: string]: unknown; content: ({ type: "text"; text: string; annotations?: { audience?: ("user" | "assistant")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; })[]; _meta?: { ...; } | undefine...'.
              Types of property 'content' are incompatible.
                Type '{}' is missing the following properties from type '({ type: "text"; text: string; annotations?: { audience?: ("user" | "assistant")[] | undefined; priority?: number | undefined; lastModified?: string | undefined; } | undefined; _meta?: { ...; } | undefined; } | { ...; } | { ...; } | { ...; } | { ...; })[]': length, pop, push, concat, and 35 more.
  Overload 2 of 6, '(name: string, paramsSchema: { targetServer: ZodEnum<{ "cloudflare-docs": "cloudflare-docs"; StitchMCP: "StitchMCP"; }>; toolName: ZodString; parameters: ZodRecord<ZodAny, SomeType>; }, annotations: { ...; }, cb: (args: ShapeOutput<...>, extra: RequestHandlerExtra<...>) => { ...; } | Promise<...>): RegisteredTool', gave the following error.
    Argument of type 'string' is not assignable to parameter of type '{ targetServer: z.ZodEnum<{ "cloudflare-docs": "cloudflare-docs"; StitchMCP: "StitchMCP"; }>; toolName: z.ZodString; parameters: z.ZodRecord<z.ZodAny, z.core.SomeType>; }'.
backend/src/index.ts(66,21): error TS2554: Expected 2-3 arguments, but got 1.
backend/src/index.ts(85,64): error TS2353: Object literal may only specify known properties, and 'headers' does not exist in type 'SSEClientTransportOptions'.
backend/src/routes/api/agents/chat.ts(9,10): error TS2305: Module '"agents"' has no exported member 'getAgentByName'.
backend/src/routes/api/agents/cloudflare-chat.ts(8,10): error TS2305: Module '"agents"' has no exported member 'getAgentByName'.
backend/src/routes/api/agents/deep-research-chat.ts(8,10): error TS2305: Module '"agents"' has no exported member 'getAgentByName'.
backend/src/routes/api/agents/session.ts(10,10): error TS2305: Module '"agents"' has no exported member 'getAgentByName'.
backend/src/routes/api/agents/sessionStatus.ts(10,10): error TS2305: Module '"agents"' has no exported member 'getAgentByName'.
backend/src/routes/api/frontend/ai/chat.ts(13,10): error TS2305: Module '"agents"' has no exported member 'getAgentByName'.
backend/src/routes/api/frontend/projects/planner.ts(19,3): error TS2305: Module '"@/ai/agents/base/agent-ai"' has no exported member 'streamTextAgent'.
backend/src/routes/api/frontend/research/research.ts(29,28): error TS2339: Property 'submitBrief' does not exist on type 'DurableObjectStub<undefined>'.
backend/src/routes/api/frontend/workshop.ts(4,10): error TS2305: Module '"agents"' has no exported member 'getAgentByName'.
backend/src/routes/api/ops/standards.ts(14,25): error TS2307: Cannot find module '@services/standardization/mcp-sync' or its corresponding type declarations.
backend/src/routes/api/ops/standards.ts(15,28): error TS2307: Cannot find module '@services/standardization/secret-sync' or its corresponding type declarations.
backend/src/routes/rpc/service.ts(24,32): error TS2307: Cannot find module '@/ai/agents/utils' or its corresponding type declarations.
backend/src/services/standardization/index.ts(1,32): error TS2307: Cannot find module './agent-gen' or its corresponding type declarations.
backend/src/services/standardization/index.ts(2,25): error TS2307: Cannot find module './mcp-sync' or its corresponding type declarations.
backend/src/services/standardization/index.ts(3,28): error TS2307: Cannot find module './secret-sync' or its corresponding type declarations.