This implementation follows your **Brutalist Sanctuary** design system—a high-stakes, obsidian-zinc environment where lines are replaced by tonal depth and cognitive load is minimized through intentional asymmetry.

We will first define the **Product Requirements Document (PRD)** for the Learning Engine UX, then provide the **Python Mockup Generator** that uses your local FastAPI/MCP service to orchestrate Stitch.

---

### Part 1: Product Requirements Document (Learning Engine UX)

#### **1. Executive Summary**
The Learning Engine UX is the command center for architectural immunization. It provides a stateful ledger of AI agent failures and successes, allowing the user to upscale existing repositories to global standards via automated "Contemplation" and "Remediation" loops.

#### **2. User Personas & Goals**
* **The Architect (User):** Wants to identify where Jules/Gemini are hallucinating paths or legacy config and verify that template-level fixes in `core-github-standardization` are working.
* **The Auditor (LearningAgent):** Needs to visualize the "In-Verification" state where Sandbox SDK is testing code fixes before proposing PRs.

#### **3. High-Level Requirements**
* **Stateful Memory:** Real-time visualization of the D1 Learning Micro-Domain.
* **Sandbox Visibility:** A "Terminal" view for active verification runs (Sandbox SDK output).
* **One-Click Upscaling:** A "Showcase" of standard assets with buttons to inject them into the active workspace.
* **Active PR HUD:** A specific view for PRs currently under "AI Supervision."

---

### Part 2: Per-Page UX Briefs (Stitch Optimization)

| Page | Aesthetic Directive | Core Components |
| :--- | :--- | :--- |
| **Dashboard** | Dense, Utilitarian, Obsidian | Recharts (Zinc Monochromatic), Stat Cards (Delta counts for hallucinations). |
| **Sessions** | Editorial, High-Spacing | Shadcn Table (No-Borders), Collapsible rows revealing Doc Enrichment context. |
| **Insights Board** | Kanban-First, High Contrast | Kibo-UI Kanban, Progress bars for Sandbox verification status. |
| **Showcase** | Grid of Materials | Card Grid. File Preview Modals (Shiki Highlighting). "Upscale" action buttons. |
| **Active Repo** | HUD / Overlay Style | Sidebar HUD listing detected violations in the current workspace + Actionable Fixes. |

---

### Part 3: Python Stitch Orchestration Script

This script acts as the "Bridge" between your local FastAPI service and Stitch UX. It loops through the required pages and triggers the `scaffold_frontend` or `generate_screen` tools.

#### `scripts/github/ai_conversation_patterns/generate_ux_suite.py`

```python
import requests
import json
import logging
import os
import time

# --- CONFIGURATION ---
BASE_URL = "http://127.0.0.1:8766/tools"
PROJECT_ID = "learning-engine-ux-2026" # Stitch project ID
DESIGN_DOC = "DESIGN.md"

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s]: %(message)s')
logger = logging.getLogger("UX-Scaffolder")

class StitchOrchestrator:
    def __init__(self):
        with open(DESIGN_DOC, 'r') as f:
            self.design_system = f.read()

    def generate_page(self, page_name: str, prompt: str):
        logger.info(f"🎨 Orchestrating Stitch for: {page_name}...")
        
        # Combine instructions with mandatory DESIGN.md context
        full_prompt = f"""
        {prompt}

        **DESIGN SYSTEM (MANDATORY):**
        {self.design_system}
        
        **TECHNICAL CONSTRAINTS:**
        - Dark Theme Shadcn Zinc (Obsidian).
        - No-Line Rule: Use surface tonal shifts, not 1px borders.
        - Atomic React components only.
        """

        payload = {
            "prompt": full_prompt,
            "target_path": f"src/frontend/src/pages/learning/{page_name}.tsx"
        }

        try:
            # Using your FastAPI 'scaffold_frontend' tool pattern
            resp = requests.post(f"{BASE_URL}/orchestration/scaffold_frontend", json=payload)
            resp.raise_for_status()
            logger.info(f"✅ Page {page_name} successfully queued for generation.")
        except Exception as e:
            logger.error(f"❌ Failed to generate {page_name}: {e}")

# --- PAGE DEFINITIONS ---

def main():
    orchestrator = StitchOrchestrator()

    pages = [
        {
            "name": "dashboard",
            "prompt": "Global Analytics Dashboard. Recharts trendlines showing 'Agent Hallucination Delta' vs 'Immunized Repos'. zinc-800 background blocks on zinc-950 canvas."
        },
        {
            "name": "sessions",
            "prompt": "Historical Analysis Sessions Table. Expandable rows revealing Cloudflare Docs grounding results for each coding thread. Minimalist, no lines, deep Zinc surfaces."
        },
        {
            "name": "insights",
            "prompt": "Architectural Insight Kanban Board. Columns: Detected, Verifying (with Sandbox spinner), Immunized. Card view for each architectural gap identified."
        },
        {
            "name": "showcase",
            "prompt": "Standard Library Showcase. Grid of cards for tsconfig.json, AGENTS.md, etc. Modal triggers to view file content and 'Upscale' buttons for active workspace."
        }
    ]

    for page in pages:
        orchestrator.generate_page(page['name'], page['prompt'])
        time.sleep(2) # Prevent rate limiting

if __name__ == "__main__":
    main()
```

---

### Part 4: Explorative Stitch Prompts (The "Prompt Vault")

Feed these directly into Stitch to refine specific high-value interactions.

#### **A. The "Upscale Plan" Modal**
> "Generate a Shadcn Dialog component for the 'Upscale current repository' action. The modal must display a step-by-step 'Implementation Plan' returned by a Jules session. Each step should have a checkbox. UI should use Zinc-900 for the dialog surface and Zinc-50 for the 'Approve & Execute' primary button. Ground the look in the Brutalist Sanctuary theme."

#### **B. The Sandbox Verification HUD**
> "Create a 'Real-time Verification HUD' React component. It should mimic a terminal window with streaming logs (Zinc-400 text) showing the Sandbox SDK cloning a repo and running 'npm run lint'. Use a 'Ghost' background (Zinc-950) with high transparency."

---

### Part 5: Updated Agent Implementation Prompt

This is the prompt you should give your **Codex Agent** to build the backend and tie it all together.

***

**Role:** Codex Senior AI Engineer
**Status:** PRD & Design Context Provided. Build the **AI Learning Engine Control Plane**.

**Execution Guidelines:**

1.  **Backend Logic (Hono + D1):**
    * Implement the 11-table Drizzle schema established in the previous turn.
    * Create `/api/learning/sync` (Trigger Workflow) and `/api/learning/upscale` (Trigger Jules Analysis).
    * Implement **Health Checks** at `/health/analysis`: monitor AI Gateway for grounding latency.

2.  **LearningAgent State Machine:**
    * **Vectorization:** Vectorize only "Signal-Rich" messages (those requiring user correction).
    * **Contemplation:** When an agent attempts a fix, check `learning_ai_pr_reflections`. If a prior fix failed, block the PR and suggest a rule update in `core-github-standardization` instead.

3.  **Active PR remediation:**
    * Update `src/backend/src/routes/api/webhooks/github.ts` to intercept `pull_request` events.
    * Auto-comment on the PR using user-persona auth. Extract the assigned agent and issue a patch instruction: `@${agent} Refactor this to use the standard 'new_sqlite_classes' migration pattern.`

4.  **Frontend (Astro + React + Shadcn):**
    * Build `/learning/dashboard`, `/learning/sessions`, `/learning/board`, and `/learning/showcase`.
    * **MANDATORY:** Every page must follow the **No-Line Brutalist Sanctuary** theme (Zinc dark levels, no borders).
    * Integrate the **"Upscale" Button**: This starts a Jules session by passing the text content of your global standardization files as "Knowledge Reference."

5.  **Data Ingestion:**
    * Process the attached `conversations.json` into the D1 schema as the baseline "Historical Memory."

***

## Antigravity Implementation Plan

### `.agent/workflows/implement-learning-frontend.md`
```markdown
# Workflow: Learning Engine Frontend & Integration

## Phase 1: Route Setup
1. Define Astro routes under `src/frontend/src/pages/learning/`.
2. Create matching React views in `src/frontend/src/views/learning/`.

## Phase 2: Component Library
1. Build the `InsightKanban` using Kibo-UI.
2. Build the `StandardCardGrid` for the Showcase.
3. Build the `TerminalHUD` for active Sandbox verification monitoring.

## Phase 3: Backend API Wiring
1. Implement the Hono handlers for `searchInsights` and `upscaleProject`.
2. Ensure the `Upscale` button triggers a Jules session via the existing `JulesService`.

## Phase 4: Active Monitoring
1. Setup the PR Commenter logic in the GitHub webhook handler.
2. Verify that comments are posted via the `user-persona` token.
```

### `.agent/rules/design-system.md`
```markdown
# Agent Rules: The Brutalist Sanctuary

- **NO-LINE POLICY:** Never use `border-` classes for containment. Use Zinc-900 on Zinc-950 backgrounds to create depth.
- **ZINC MONOCHROME:** All Recharts and UI accents MUST use the monochromatic Zinc scale. The only exception is 'Success' (Zinc-200) and 'Critical' (Zinc-50).
- **SYSTEM-FIRST:** Remove all user-centric icons (avatars, profiles) unless explicitly requested. The UI is a utility tool, not a social platform.
```

Would you like me to generate the **Astro route files** for these pages to ensure the folder structure matches your workspace exactly?