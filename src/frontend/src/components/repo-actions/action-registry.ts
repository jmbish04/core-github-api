/**
 * action-registry.ts
 *
 * Typed registry of all Repo Actions exposed in the sidebar-in-dialog.
 * Adding a new action is a single object push — sidebar, content pane,
 * and dispatch logic all derive from this registry automatically.
 */

import type { LucideIcon } from "lucide-react";
import {
  Sparkles,
  GitPullRequest,
  FileText,
  Wand2,
  FileJson,
  Shield,
  Layout,
  PaintBucket,
  KeyRound,
  Trash2,
  Settings2,
  ScrollText,
  Activity,
  GitMerge,
  BookOpen,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

export type ActionHandler = "jules" | "sync-secrets" | "custom";

export interface RepoAction {
  /** Unique machine-readable ID */
  id: string;
  /** Display label shown in the sidebar & header */
  label: string;
  /** Category grouping for the sidebar */
  category: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Multi-line description rendered in the right content pane */
  description: string;
  /** Optional README / instructions markdown shown below description */
  instructions?: string;
  /** If true, shows a textarea for the user to customise the prompt */
  requiresInput?: boolean;
  /** Textarea placeholder text */
  inputPlaceholder?: string;
  /** Which handler to dispatch to */
  handler: ActionHandler;
  /** Default Jules prompt (only used when handler === "jules") */
  prompt?: string;
}

// ── Categories (ordering) ──────────────────────────────────────────────────

export const ACTION_CATEGORIES = [
  "Jules Commands",
  "Design",
  "Operations",
  "Maintenance",
  "Observability",
] as const;

export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

// ── Registry ───────────────────────────────────────────────────────────────

export const REPO_ACTIONS: RepoAction[] = [
  // ── Jules Commands ─────────────────────────────────────────────────────
  {
    id: "jules-create-plan",
    label: "Create a Plan",
    category: "Jules Commands",
    icon: Sparkles,
    handler: "jules",
    description:
      "Analyze the current state of the repository and create a comprehensive coding plan for the next major feature or refactor.",
    instructions:
      "Jules will inspect the repo structure, open issues, recent PRs and codebase, then produce a prioritised plan as a PR.",
    prompt:
      "Analyze the current state of the repository and create a comprehensive coding plan for the next major feature or refactor.",
  },
  {
    id: "jules-create-pr",
    label: "Create PR from Prompt",
    category: "Jules Commands",
    icon: GitPullRequest,
    handler: "jules",
    description:
      "Describe what you want Jules to build and it will create a pull request with the implementation.",
    instructions:
      "Enter a detailed prompt below. Jules will plan the changes, write code, and open a PR on your behalf.",
    requiresInput: true,
    inputPlaceholder: "Refactor component structure, add error boundaries...",
    prompt: "", // user-provided
  },
  {
    id: "jules-docstring-normalizer",
    label: "DocString Normalizer",
    category: "Jules Commands",
    icon: FileText,
    handler: "jules",
    description:
      "Pass through the entire codebase and apply doc strings everywhere, following each module's best practices and optimising for AI coding agents.",
    instructions:
      "Jules will add verbose docstrings at the top of each file and above all code blocks. Existing docs are preserved and improved.",
    prompt:
      "Pass through the entire code base and apply doc string everywhere following the impacted code module best practices optimizing for ai coding agents apply doc string verbosely at the top of the file and above all code blocks",
  },
  {
    id: "jules-optimizer",
    label: "Optimizer",
    category: "Jules Commands",
    icon: Wand2,
    handler: "jules",
    description:
      "Detect duplicated code, methods, or functionality introduced by AI coding agents and merge them without losing behaviour.",
    instructions:
      "Jules will identify duplicates, merge into canonical implementations, and update every call-site so nothing breaks.",
    prompt:
      "Review the code and look for duplicated ai coding agent oversights where it duplicated code or methods or functionality and to then merge all of that without losing any functionality and then to update any impacted invokers so they use the new merged version and required params, etc.",
  },
  {
    id: "jules-security-audit",
    label: "Security Audit",
    category: "Jules Commands",
    icon: Shield,
    handler: "jules",
    description:
      "Perform a deep security audit checking for hardcoded secrets, injection vulnerabilities, and authentication issues.",
    instructions:
      "Jules will scan the full codebase, flag issues with severity ratings, and open a PR with fixes.",
    prompt:
      "Perform a deep security audit of the codebase, checking for hardcoded secrets, injection vulnerabilities, and proper authentication mechanisms. Create a PR with fixes.",
  },
  {
    id: "jules-dependency-update",
    label: "Update Dependencies",
    category: "Jules Commands",
    icon: FileJson,
    handler: "jules",
    description:
      "Analyze package.json and update dependencies to their latest stable versions, fixing any breaking changes.",
    instructions:
      "Jules will bump versions, resolve breaking API changes, run tests, and submit a PR.",
    prompt:
      "Analyze package.json and update dependencies to their latest stable versions, fixing any breaking changes. Create a PR.",
  },
  {
    id: "jules-generate-readme",
    label: "Generate README",
    category: "Jules Commands",
    icon: BookOpen,
    handler: "jules",
    description:
      "Conduct a comprehensive analysis of the codebase and generate a professional, production-grade README.md with architecture diagrams, deployment guides, and code examples.",
    instructions:
      "Jules will act as a Senior Technical Writer and Lead Systems Architect. It scans the entire codebase — tech stack, entry points, environment config, and data flow — then generates a fully structured README with badges, feature lists, Mermaid diagrams, deployment checklists, and local dev instructions.",
    prompt: `# 🤖 Repository Analysis & README Generation

> **Role:** Senior Technical Writer & Lead Systems Architect
>
> **Objective:** Analyze this repository and generate a professional, production-grade \`README.md\`.
> Match the structure, visual hierarchy, and persuasive flow of top-tier OSS READMEs (e.g., Cloudflare Vibe SDK).

---

## Phase 1 — Deep Codebase Analysis

Before writing, scan and understand:

1. **Core Mission** — What is the primary problem this repo solves?
2. **Tech Stack** — Identify frontend, backend, database, ORM, and infrastructure (e.g., Cloudflare Workers, Hono, Drizzle, Astro, React, Python).
3. **Entry Points** — Identify main scripts, API routes (\`/openapi.json\`, \`/health\`), and application logic.
4. **Environment Config** — Scan for \`.env.example\`, \`wrangler.jsonc\`, or config files; list required secrets and variables.
5. **Architecture** — Map data flow: how the frontend talks to the backend, how AI is integrated, etc.

---

## Phase 2 — README Sections (Required)

Generate the README using **exactly** these sections in order:

### 2.1 Header & Hook
- Bold title with a relevant emoji
- Single-sentence high-impact tagline
- "Live Demo / Deploy" CTA block with badges

### 2.2 What is [Project Name]?
- 1–2 paragraphs capturing the "vibe" and purpose

### 2.3 Perfect For
- 3 personas or use cases, each as an \`### H3\` header (e.g., "Internal Dev Teams", "SaaS Platforms")

### 2.4 Key Features
- Bulleted list with **bolded labels** and relevant emojis (🤖 ⚡ 💬 🔒)

### 2.5 Tech Stack
- "Built on …" section highlighting the ecosystem (e.g., "Built on Cloudflare's Platform")

### 2.6 Programmatic Access / SDK Usage
- Copy-pasteable TypeScript or Python code block showing primary usage

### 2.7 Deployment Guide
- Quick Deploy Checklist with checkboxes (\`- [ ]\`)
- Required API Keys subsection
- Configuration table for environment variables:

| Variable | Required | Description |
|----------|----------|-------------|

### 2.8 How It Works
- Mermaid \`graph\` flowchart showing the application's logic flow

### 2.9 Deep Dive
- 1–2 code snippets highlighting unique architectural patterns (e.g., a specific Class, Middleware, or Agent)

### 2.10 Local Development
- Step-by-step: \`git clone\` → install → setup → \`run dev\`

### 2.11 Operations & Support
- **Troubleshooting** — common errors and fixes
- **Security / Privacy** — relevant notes
- **Contributing** — contribution guidelines

---

## Style & Tone Rules

- **Scannability:** Use horizontal rules (\`---\`), blockquotes (\`>\`), and tables to break up text.
- **Tone:** Professional, authoritative, approachable, and exciting.
- **5-Minute Rule:** A developer must be able to get the project running using only the README.
- **No Placeholders:** Never use \`[Insert Info Here]\`. Omit the section or derive the answer from the code.

---

**Now analyze the codebase and output the final \`README.md\`.**`,
  },

  // ── Design ─────────────────────────────────────────────────────────────
  {
    id: "generate-landing-page",
    label: "Generate Landing Page",
    category: "Design",
    icon: Layout,
    handler: "jules",
    description:
      "Generate a production-ready landing page implementation for this project.",
    instructions:
      "Jules will create a Stitch-compatible landing page task, design the layout, and submit a PR with the page code.",
    prompt: "Generate a landing page implementation task.",
  },
  {
    id: "design-frontend",
    label: "Design Frontend",
    category: "Design",
    icon: PaintBucket,
    handler: "jules",
    description:
      "Analyze this backend and design a comprehensive frontend UX study with Stitch-ready requirements.",
    instructions:
      "Jules will study your API surface, propose a UI architecture, and submit a Stitch-ready design document as a PR.",
    prompt:
      "Analyze this backend and design a comprehensive frontend UX study. Submit Stitch-ready requirements.",
  },

  // ── Operations ─────────────────────────────────────────────────────────
  {
    id: "sync-default-secrets",
    label: "Sync Default Secrets",
    category: "Operations",
    icon: KeyRound,
    handler: "sync-secrets",
    description:
      "Push default environment secrets to your GitHub repository's encrypted secrets store.",
    instructions:
      "This will sync all managed secrets (API keys, tokens) from the central vault to this repo's GitHub Actions Secrets. Existing secrets are overwritten.",
  },

  // ── Maintenance ────────────────────────────────────────────────────────
  {
    id: "clean-up-code",
    label: "Clean Up Code",
    category: "Maintenance",
    icon: Trash2,
    handler: "jules",
    description:
      "Modularize code, improve docstrings, and reduce technical debt across the entire codebase.",
    instructions:
      "Jules will identify dead code, refactor large modules, and improve documentation. Submitted as a PR.",
    prompt:
      "Create a cleanup task: modularize code, improve docstrings, and reduce technical debt.",
  },
  {
    id: "setup-cicd",
    label: "Setup CI/CD",
    category: "Maintenance",
    icon: Settings2,
    handler: "jules",
    description:
      "Set up Cloudflare CI/CD with deployment checks and automated rollback strategy.",
    instructions:
      "Jules will configure wrangler deploy hooks, add health checks post-deploy, and implement automatic rollback on failure.",
    prompt:
      "Set up Cloudflare CI/CD with deployment checks and automated rollback strategy.",
  },

  // ── Observability ──────────────────────────────────────────────────────
  {
    id: "show-recent-logs",
    label: "Show Recent Logs",
    category: "Observability",
    icon: ScrollText,
    handler: "jules",
    description:
      "Inspect recent production logs and summarize issues with remediation steps.",
    instructions:
      "Jules will pull recent log entries, categorize errors by severity, and provide a remediation plan.",
    prompt:
      "Inspect recent logs and summarize production issues with remediation steps.",
  },
  {
    id: "check-build-status",
    label: "Check Build Status",
    category: "Observability",
    icon: Activity,
    handler: "jules",
    description:
      "Check build and deployment status, then explain failures and suggest fixes.",
    instructions:
      "Jules will query your CI/CD pipeline, identify failing steps, and recommend solutions.",
    prompt:
      "Check build and deployment status, then explain failures and suggested fixes.",
  },
  {
    id: "prioritize-pending-prs",
    label: "Prioritize Pending PRs",
    category: "Observability",
    icon: GitMerge,
    handler: "jules",
    description:
      "Review all pending pull requests and prioritize them by deployment risk.",
    instructions:
      "Jules will analyze each PR's diff size, test coverage impact, and dependency changes to rank them.",
    prompt:
      "Review pending pull requests and prioritize by deployment risk.",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

/** Group actions by category, preserving the canonical category order. */
export function getGroupedActions(): Map<string, RepoAction[]> {
  const map = new Map<string, RepoAction[]>();
  for (const cat of ACTION_CATEGORIES) {
    const items = REPO_ACTIONS.filter((a) => a.category === cat);
    if (items.length > 0) map.set(cat, items);
  }
  return map;
}
