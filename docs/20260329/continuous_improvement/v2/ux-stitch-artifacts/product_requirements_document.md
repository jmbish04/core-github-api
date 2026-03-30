# PRD: Agentic Sentinality — The Agent Meta-Governance & Fleet Immune System
## Vision: Automating the "Golden Path" through Agentic Meta-Governance.

**Document Type:** Full Product Requirements Document  
**Version:** 1.2  
**Date:** March 29, 2026  
**Author:** AI Product Manager (Senior Architect)  
**Stakeholders:** Senior AI Engineers, DevOps/SRE Agents, Automated Code Reviewers.

---

#### **1. Executive Summary**
Project `Agentic Sentinality` is a command-and-control meta-governance platform designed to eliminate the "repetition tax" paid when AI agents make recurring architectural errors. It operates as a closed-loop system that extracts insights from raw conversation histories, validates them against Cloudflare documentation "ground truths," and automatically enforces repository-wide guardrails. By combining real-time PR interception with global template immunization, `Agentic Sentinality` ensures that once a lesson is learned by one agent, it is permanently inherited by the entire fleet.

`Agentic Sentinality` is an autonomous governance layer for a fleet of Cloudflare Workers. It reduces the "repetition tax" by transforming historical conversation failures into persistent global standards. It automates infrastructure boilerplate (Drizzle migrations, OpenAPI generation, Health checks) and employs "Babysitter Agents" to monitor and course-correct active AI sessions in real-time.

#### **2. Problem Statement / Opportunity**
AI agents frequently "reinvent the wheel" poorly, delivering "square wheels" (e.g., non-standard tsconfig, missing health checks, improper Env access) that require human remediation. Sentinel captures these patterns, creates global rules, and automates the configuration so the "Golden Path" is the path of least resistance.

AI coding agents (Jules, Stitch, etc.) are fundamentally stateless across different sessions. This leads to "Doom Loops" where agents repeatedly hallucinate paths, miss health endpoints, or fail to handle `Env` bindings correctly. Developers are forced to issue the same corrective prompts repeatedly, wasting context window and compute tokens.

By treating conversation history as a structured dataset, we can identify these failure patterns. Using high-context models (Gemini 3.1 1M) and the Jules SDK, we can automate the remediation process—writing the very rules (`.agent/rules`) and templates (`core-github-standardization`) that agents use to stay on the "Golden Path."

#### **3. Goals & Objectives**
* **SMART Goal 1:** Reduce manual corrective prompts for "known architectural patterns" by 90% within 30 days of deployment.
* **SMART Goal 2:** Achieve a 100% "Immunization Success Rate" (preventing an agent from repeating an error once a `Agentic Sentinality` PR has been merged into `core-github-standardization`). For example, Standardize package.json to include auto-running Drizzle migrations and wrangler types generation.
* **Smart Goal 3:** Zero-Hallucination Guardrails: Use Repoless Jules (Gemini 3.1 1M) to derive standards that are cross-referenced with cloudflare-docs MCP.
* **Business Objective:** Minimize operational costs by reducing LLM token waste caused by repetitive debugging cycles. **Real-time Interception**: Deploy worker-hosted agents that listen to Jules session streams and intervene before a "Doom Loop" apology cycle begins.
* **Product Objective:** Provide a pixel-perfect "Monolith" dashboard that allows a human engineer to oversee the learning progress of the entire agent ecosystem at a glance.

#### **4. Target Audience**
##### Meta-Architects managing a distributed ecosystem of high-performance Cloudflare Workers.
* **Primary:** Justin Bishop (Senior Engineer) managing a fleet of agents across multiple high-stakes repositories.
* **User Persona:** The "Meta-Architect"—an engineer who spends more time designing agent behaviors and repository standards than writing raw lines of code.
* **Secondary:** Supervisory agents that consume `Agentic Sentinality`'s API to understand current "hot zones" of failure in the codebase.



#### **5. Scope & Key Features**
* **Pattern Analyst (Repoless Mode, *The Ingester*):** Native Worker-based extraction service. Replaces the Python script. Ingests Jules sessions and GitHub PRs directly into D1 tables. It identifies recursive friction points and summarizes them into "`Agentic Sentinality` Insights."
* **Repoless Analyst:** Uses jules-sdk in repoless mode to analyze entire multi-megabyte conversation threads to extract Agentic Sentinality Insights.
* **The Babysitter (Orchestrator)**: A Durable Object agent that polls active Jules sessions. If detection logic triggers (e.g., repeated apologies), it injects a "System Override" message to reset the agent's strategy.
* **Golden Path Scaffolder:** A service that detects a new repo and automatically initializes it with the current fleet-wide core-github-standardization assets (OpenAPI, Zod schemas, Shadcn components).
* **The Contemplation Gate:** A state-machine logic within the `LearningAgent` that checks a D1 ledger before proposing a fix. It prevents "Light Switch" loops by choosing to update a global template rather than applying a localized patch.
* **Active PR Interceptor:** A webhook-driven service that scans open PRs by AI bots. If an anti-pattern is detected, it posts a comment directed at the bot (`@jules, please fix [X]`) using a human-persona token.
* **Immune System "Immunization":** Automated PR generation to `core-github-standardization` to update `AGENTS.md` and `.agent/rules/` globally.
* **The Showcase UI:** An interactive catalog of all fleet-wide standards with a "One-Click Upscale" button to force a specific repository to align with the latest standardization files.


#### **6. Non-Goals / Out of Scope**
* **Self-Correction of Logic/Business Rules:** `Agentic Sentinality` focuses on **architectural and infra standards** (e.g., Cloudflare patterns), not the correctness of app-specific business logic.
* **Automatic Merging:** `Agentic Sentinality` proposes PRs and comments, but the final merge into `main` remains a human-in-the-loop (HITL) action.
* **Support for non-Cloudflare stacks:** `Agentic Sentinality` is strictly optimized for the 2026 Cloudflare Native stack.

#### **7. Success Metrics / KPIs**
* **Immunity Score:** A percentage of repositories currently synced with the latest `core-github-standardization` SHA.
* **Doom Loop Detection Rate:** Number of times the Babysitter Agent successfully intercepted a circular apology loop.
* **Token Efficiency Gain:** Calculated reduction in tokens used for "refactoring" and "debugging" categories vs. "feature implementation."

#### **8. High-Level Technical Considerations**
* **Auth Proxy:** Use the human user-persona token for agent interventions to ensure they aren't blocked by GitHub's automated bot filters.
* **Data:** Drizzle ORM + D1. IDs must be integer().primaryKey({ autoIncrement: true }).
* **API:** Hono OpenAPI v3.1.0 serving /openapi.json, /swagger, and /scaler.
* **Durable Object Persistence:** The `BabysitterAgent` must use `new_sqlite_classes` to maintain a persistent state of which sessions are currently being "watched."
* **UI Hierarchy:** Astro + React + Shadcn Dark. Rule: No Borders. Use tonal Zinc shifts for hierarchy. Adhere to "The Monolith" design—utilize tonal zinc depths (Zinc-950/900/800) to signify hierarchy; **No Borders allowed.**
* **Ground Truth Engine:** Every insight MUST be cross-referenced with a fetch to `cloudflare-docs` MCP to ensure `Agentic Sentinality` isn't hallucinating its own standards.

#### **9. High-Level Milestones**
* **Phase 1 (Infrastructure):** Scaffolding the 10-table Drizzle schema and D1 migrations. (Target: Hour 4)
* **Phase 2 (Ingestion):** Deploying the Repoless Analysis service and ingesting the first 20MB of `conversations.db`. (Target: Day 1)
* **Phase 3 (The Brain):** Implementing the Contemplation Gate logic and the `LearningAgent`. (Target: Day 2)
* **Phase 4 (Frontend):** Launching the Dashboard, Kanban Board, and Showcase pages. (Target: Day 3)
* **Phase 5 (Active Interception):** Wiring GitHub Webhooks for the PR Interceptor. (Target: Day 4)

#### **10. Assumptions**
* Gemini 3.1 Pro 1M context window is available and stable via the Jules SDK.
* The `core-github-standardization` repository is the canonical source of truth for all child projects.
* D1's SQLite storage is sufficient for the immediate pattern ledger (scaling to millions of rows).

#### **11. Risks & Dependencies**
* **Dependency:** Jules SDK's `repoless: true` mode must support raw text ingestion of the size of `conversations.json`.
* **Risk:** Bot loops where `Agentic Sentinality` and Jules get stuck arguing; mitigated by the "Babysitter Override" which forces a context reset.
* **Risk:** Token costs for daily full-history scans; mitigated by "Signal-Driven Vectorization" which only re-analyzes new or high-analysis messages.

#### **12. Open Questions / Next Steps**
* **Next Step:** Implement the `JulesGovernanceService` wrapper to test repoless analysis against a sample of `conversations.json`.
* **Question:** Should `Agentic Sentinality` have the power to close a PR if the "Immunity Score" is too low? (Decision: Currently deferred to human oversight).