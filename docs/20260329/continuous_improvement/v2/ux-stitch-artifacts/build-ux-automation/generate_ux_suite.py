import requests
import json
import logging
import os
import time

# --- CONFIGURATION ---
BASE_URL = "http://127.0.0.1:8766/tools" # See openapi.json ./jules-mcp-openapi.json
PROJECT_ID = "13012573773347159111" # Stitch project ID
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
            logger.info(resp.text)
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