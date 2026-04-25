/**
 * @file db/services/agent-config/seed.ts
 * @description Seed data for agent_function_configs.
 *
 * Contains the canonical default config for every primary method of each
 * of the 10 canonical agents. Run via `POST /api/agents/config/seed` (admin-only).
 *
 * ## Provider Strategy
 *
 * | Provider      | Model resolved as       | Best for                                         |
 * |---------------|-------------------------|--------------------------------------------------|
 * | `'jules'`     | Jules repoless session  | Large-context jobs: full repo ingestion, planning|
 * |               | (Gemini 2.5 Pro, 1M ctx)| reverseEngineer, planFeature, standardize, etc.  |
 * | `'gemini'`    | gemini-2.0-flash        | Fast generation, chat, small structured tasks    |
 * | `'openai'`    | gpt-4o / gpt-4o-mini    | Structured output, PR descriptions, copy         |
 * | `'workers-ai'` | llama-3.x (fallback)    | Free fallback, latency-tolerant tasks            |
 *
 * Jules repoless is configured with `provider: 'jules'`, `model: 'jules'`.
 * The AIProvider automatically routes this to `JulesService.startRepolessSession()`
 * with `repoless: true`, which runs Gemini 2.5 Pro under its 1M-token context window.
 * The secondary provider is always a fast synchronous fallback for when Jules is slow.
 *
 * @module Services/AgentConfig
 */
import type { NewAgentFunctionConfig } from './index';
import { CloudflareDocsPrompt } from "@/db/services/agent-config/prompts/cloudflareDocs";

const PROVIDERS = {
  'jules': {
    'default': 'jules'
  },
  'gemini': {
    'default': 'gemini-3.1-pro-preview',
    'flash': 'gemini-3.1-flash-preview',
    'pro': 'gemini-3.1-pro-preview',
  },
  'workersai': {
    'default': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    'llama': {
      'default': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'flash': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      'pro': '@cf/meta/llama-4-scout-17b-16e-instruct',
    },
    'openai': {
      'default': '@cf/openai/gpt-oss-120b',
      'flash': '@cf/openai/gpt-oss-20b',
      'pro': '@cf/openai/gpt-oss-120b',
    },
    'qwen': {
      'default': '@cf/qwen/qwen3-30b-a3b-fp8',
      'flash': '@cf/qwen/qwen2.5-coder-32b-instruct',
      'pro': '@cf/qwen/qwen3-30b-a3b-fp8',
    },
    'moonshotai': {
      'default': '@cf/moonshotai/kimi-k2-instruct',
      'flash': '@cf/moonshotai/kimi-k2-instruct',
      'pro': '@cf/moonshotai/kimi-k2-instruct',
    },
    'deepseek': {
      'default': '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
      'flash': '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
      'pro': '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    }
  }
};

export const AGENT_CONFIG_SEED: Omit<NewAgentFunctionConfig, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // ── OrchestratorAgent ──────────────────────────────────────────────────────

  {
    agentName: 'OrchestratorAgent',
    functionName: 'submitRequest',
    label: 'Parse & Submit User Request',
    // Fast path — parse prompt into sprint, no large context needed
    primaryProvider: 'gemini',
    primaryModel: PROVIDERS.gemini.pro,
    secondaryProvider: 'workers-ai',
    secondaryModel: PROVIDERS.workersai.llama.pro,
    systemInstructions: `You are the top-level orchestrator. 
      Parse the user request into a SWARM task tree, identify subtasks, 
      assign them to specialist agents, and return a structured Sprint object.
    `,
    isActive: true,
  },
  {
    agentName: 'OrchestratorAgent',
    functionName: 'reverseEngineer',
    label: 'Reverse Engineer Repository',
    // Jules repoless: ingests entire repo (potentially 100k+ tokens of file tree + code)
    // Gemini 2.5 Pro 1M context via Jules session — ideal for PRD + epic + UX tree generation
    primaryProvider: 'jules',
    primaryModel: PROVIDERS.jules.default,
    // Fast synchronous fallback if Jules session is slow or unavailable
    secondaryProvider: 'gemini',
    secondaryModel: PROVIDERS.gemini.pro,
    notes: 'Jules repoless preferred — Gemini 3.1 Pro 1M ctx handles full repo ingestion.',
    systemInstructions: `You are a senior architect. 
      Analyze the repository structure and produce a PRD, epic breakdown, 
      user journey map, and UX evidence tree. 
      Be exhaustive — use the full context window to capture all architectural decisions.
    `,
    isActive: true,
  },
  {
    agentName: 'OrchestratorAgent',
    functionName: 'planFeature',
    label: 'Plan Feature Implementation',
    // Jules repoless: planning requires reading all existing files to avoid conflicts
    primaryProvider: 'jules',
    primaryModel: PROVIDERS.jules.default,
    secondaryProvider: 'gemini',
    secondaryModel: PROVIDERS.gemini.pro,
    notes: 'Jules repoless preferred — needs full codebase context to plan safely across all existing files.',
    systemInstructions: `You are a senior software architect. 
      Break the feature request into a detailed, file-level implementation plan 
      with verifiable acceptance criteria. Read ALL existing files relevant 
      to the change before proposing any modifications.
    `,
    isActive: true,
  },

  // ── EngineerAgent ─────────────────────────────────────────────────────────

  {
    agentName: 'EngineerAgent',
    functionName: 'runSprint',
    label: 'Execute Sprint Task',
    // Task execution is incremental — fast model is fine per subtask
    primaryProvider: 'gemini',
    primaryModel: PROVIDERS.gemini.flash,
    secondaryProvider: 'workers-ai',
    secondaryModel: PROVIDERS.workersai.llama.pro,
    systemInstructions: `You are a pragmatic full-stack engineer. 
      Execute the given sprint task precisely, following existing code patterns 
      and Cloudflare Workers best practices.
    `,
    isActive: true,
  },
  {
    agentName: 'EngineerAgent',
    functionName: 'buildLandingPage',
    label: 'Generate Landing Page',
    // GPT-4o excels at structured HTML/TSX generation with design eye
    primaryProvider: 'gemini',
    primaryModel: PROVIDERS.gemini.pro,
    secondaryProvider: 'workers-ai',
    secondaryModel: PROVIDERS.workersai.llama.pro,
    systemInstructions: `You are a frontend engineer and conversion rate optimizer. 
      Generate a premium, dark-theme Astro + shadcn/ui landing page that wows on first impression.
    `,
    isActive: true,
  },

  // ── ResearchAgent ─────────────────────────────────────────────────────────

  {
    agentName: 'ResearchAgent',
    functionName: 'runDeepResearch',
    label: 'Run Deep Research Job',
    // Jules repoless: deep research passes consume many docs simultaneously
    primaryProvider: 'jules',
    primaryModel: PROVIDERS.jules.default,
    secondaryProvider: 'gemini',
    secondaryModel: PROVIDERS.gemini.pro,
    notes: 'Jules repoless preferred — 1M context for multi-document synthesis and citation tracking.',
    systemInstructions: `You are a senior research analyst. 
      Conduct thorough, citation-backed research on the given topic. 
      Leverage the full context window to cross-reference all provided sources. 
      Return structured findings with inline citations.
    `,
    isActive: true,
  },
  {
    agentName: 'ResearchAgent',
    functionName: 'analyzeTrends',
    label: 'Analyze GitHub Trends',
    // Trend analysis is fast/small — flash is fine
    primaryProvider: 'gemini',
    primaryModel: PROVIDERS.gemini.flash,
    secondaryProvider: 'workers-ai',
    secondaryModel: PROVIDERS.workersai.llama.pro,
    systemInstructions: `You are a technology trend analyst. 
      Analyze repository metrics and extract actionable insights 
      about technology adoption and community momentum.
    `,
    isActive: true,
  },

  // ── GuardrailAgent ────────────────────────────────────────────────────────

  {
    agentName: 'GuardrailAgent',
    functionName: 'validateOutput',
    label: 'Validate Agent Output',
    // Validation is against a single output — fast model sufficient
    primaryProvider: 'gemini',
    primaryModel: PROVIDERS.gemini.flash,
    secondaryProvider: 'workers-ai',
    secondaryModel: PROVIDERS.workersai.llama.pro,
    systemInstructions: `You are a strict quality auditor. 
      Validate the provided output against the project's architectural standards, 
      security guidelines, and coding conventions. 
      Return pass/fail with specific findings.
    `,
    isActive: true,
  },
  {
    agentName: 'GuardrailAgent',
    functionName: 'standardize',
    label: 'Standardize Repository',
    // Jules repoless: full repo audit — needs to see every file to assess standardization gaps
    primaryProvider: 'jules',
    primaryModel: PROVIDERS.jules.default,
    secondaryProvider: 'gemini',
    secondaryModel: PROVIDERS.gemini.pro,
    notes: 'Jules repoless preferred — standardization audit requires reading the entire codebase.',
    systemInstructions: `You are a senior DevOps architect. 
      Audit the ENTIRE repository against standardization rules using the full context window. 
      Produce a prioritized remediation plan covering all files, configs, and CI/CD definitions found.
    `,
    isActive: true,
  },

  // ── GithubAgent ───────────────────────────────────────────────────────────

  {
    agentName: 'GithubAgent',
    functionName: 'analyzeRepo',
    label: 'Analyze Repository',
    // Repo analysis is summary-level — flash is fine
    primaryProvider: 'jules',
    primaryModel: PROVIDERS.jules.default,
    secondaryProvider: 'gemini',
    secondaryModel: PROVIDERS.gemini.pro,
    systemInstructions: `You are a GitHub specialist. 
      Analyze the repository's structure, CI/CD health, contribution patterns, and code quality signals.
    `,
    isActive: true,
  },
  {
    agentName: 'GithubAgent',
    functionName: 'generatePrDescription',
    label: 'Generate PR Description',
    // PR descriptions are short, structured — gpt-4o-mini is cost-efficient and precise
    primaryProvider: 'jules',
    primaryModel: PROVIDERS.jules.default,
    secondaryProvider: 'gemini',
    secondaryModel: PROVIDERS.gemini.pro,
    systemInstructions: `You are a technical writer. 
      Write a clear, structured GitHub pull request description that explains the change, 
      the motivation, and how to verify it.
    `,
    isActive: true,
  },

  // ── CloudflareAgent ───────────────────────────────────────────────────────

  {
    agentName: 'CloudflareAgent',
    functionName: 'answerDocs',
    label: 'Answer Cloudflare Docs Query',
    // RAG-assisted Q&A with injected context — flash is fast and accurate
    primaryProvider: 'gemini',
    primaryModel: PROVIDERS.gemini.flash,
    secondaryProvider: 'workers-ai',
    secondaryModel: PROVIDERS.workersai.deepseek.pro,
    systemInstructions: CloudflareDocsPrompt,
    isActive: true,
  },

  // ── DesignAgent (DesignAgent) ──────────────────────────────────────

  {
    agentName: 'DesignAgent',
    functionName: 'generateUiMockup',
    label: 'Generate UI Mockup via Stitch',
    // Prompt enrichment for Stitch — flash is sufficient (output is a prompt, not code)
    primaryProvider: 'gemini',
    primaryModel: PROVIDERS.gemini.pro,
    secondaryProvider: 'gemini',
    secondaryModel: PROVIDERS.gemini.flash,
    systemInstructions: `You are a senior product designer and UX researcher. 
      Generate a detailed Stitch UI prompt that will produce a premium, 
      dark-theme interface adhering to the Colby design system.
    `,
    isActive: true,
  },
  {
    agentName: 'DesignAgent',
    functionName: 'runUxResearch',
    label: 'UX Research Analysis',
    // Jules repoless: UX research reads entire codebase to extract user flows and patterns
    primaryProvider: 'jules',
    primaryModel: PROVIDERS.jules.default,
    secondaryProvider: 'gemini',
    secondaryModel: PROVIDERS.gemini.pro,
    notes: 'Jules repoless preferred — UX research requires reading all components, pages, and routes simultaneously.',
    systemInstructions: `You are a UX researcher and information architect. 
      Analyze the entire provided codebase context using the full 1M token window. 
      Extract user flows, mental models, interaction patterns, and information architecture decisions. 
      Produce an exhaustive, evidence-based UX brief.
    `,
    isActive: true,
  },

  // ── LearningAgent ───────────────────────────────────────────────

  {
    agentName: 'LearningAgent',
    functionName: 'extractLearning',
    label: 'Extract Session Learnings',
    // Session transcript analysis — flash is fast and cost-efficient
    primaryProvider: 'gemini',
    primaryModel: PROVIDERS.gemini.flash,
    secondaryProvider: 'workers-ai',
    secondaryModel: PROVIDERS.workersai.llama.pro,
    systemInstructions: `You are a meta-learning analyst. 
      Review the session transcript and extract actionable learning instincts — patterns, 
      anti-patterns, and best practices — that improve future agent performance.
    `,
    isActive: true,
  },

  // ── WorkshopAgent ─────────────────────────────────────────────────────────

  {
    agentName: 'WorkshopAgent',
    functionName: 'chat',
    label: 'Workshop Chat',
    // Real-time chat — latency sensitive, flash required
    primaryProvider: 'gemini',
    primaryModel: PROVIDERS.gemini.flash,
    secondaryProvider: 'workers-ai',
    secondaryModel: PROVIDERS.workersai.llama.pro,
    systemInstructions: `You are a collaborative workshop facilitator and full-stack engineer. 
      Help users explore ideas, build features, and architect solutions. 
      Be concise, practical, and proactive.
    `,
    isActive: true,
  },
  {
    agentName: 'WorkshopAgent',
    functionName: 'generateSpec',
    label: 'Generate Implementation Spec',
    // Jules repoless: spec generation needs full project context to avoid duplication/conflicts
    primaryProvider: 'jules',
    primaryModel: PROVIDERS.jules.default,
    secondaryProvider: 'gemini',
    secondaryModel: PROVIDERS.gemini.pro,
    notes: 'Jules repoless preferred — generating a spec requires reading the full project to avoid conflicts with existing implementation.',
    systemInstructions: `You are a senior technical writer and architect. 
      Analyze the ENTIRE project codebase first, then generate a detailed, file-level implementation specification. 
      Explicitly reference existing files and patterns — no duplication.
    `,
    isActive: true,
  },

  // ── ChatRoom ──────────────────────────────────────────────────────────────

  {
    agentName: 'ChatRoom',
    functionName: 'processMessage',
    label: 'Process Chat Message',
    // Conversational: latency > context window, flash always
    primaryProvider: 'gemini',
    primaryModel: PROVIDERS.gemini.flash,
    secondaryProvider: 'workers-ai',
    secondaryModel: PROVIDERS.workersai.llama.pro,
    systemInstructions: `You are a helpful AI assistant. 
      Respond conversationally, be concise, and proactively surface relevant information 
      from the conversation history.
    `,
    isActive: true,
  },

  // ── Jules Internal ────────────────────────────────────────────────────────

  {
    agentName: 'Jules',
    functionName: 'structureResponse',
    label: 'Format Jules output',
    primaryProvider: 'workers-ai',
    primaryModel: PROVIDERS.workersai.llama.pro,
    secondaryProvider: 'gemini',
    secondaryModel: PROVIDERS.gemini.flash,
    systemInstructions: `You are a rigid JSON formatting tool. 
      Extract and format the provided text strictly according to the requested JSON schema. 
      Do not include markdown formatting or conversational filler.
    `,
    isActive: true,
  },
];
